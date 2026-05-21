// ai/director.js — the per-stage "AI fill" functions.
//
// Philosophy (post-refactor): the LLM does exactly TWO jobs in this whole app.
//   1. Cast & World — turn a prose character/location sheet into a clean visual
//      tag list. This is the one genuinely hard NLP task; LLM effort belongs here.
//   2. Pages — translate a panel's prose mood ("eerie urban stillness") into 3-5
//      visual lighting/atmosphere tags. Small, bounded, batched per page.
// Everything else is deterministic:
//   - camera shot   → detectCameraShot() on the visual text
//   - characters    → dialogue speakers + name mentions
//   - location      → the scene's location (set at ingest), or detectLocation()
//   - panel prompt  → compilePanelPrompt() — template assembly, render-mode aware
// If no LLM is configured, every stage still produces a usable result.

import { updateProject, addHistory, createJob, updateJob, getProject } from '../db.js';
import {
  compilePrompt, compilePanelPrompt, finalizeLLMPrompt, llmInstructionsFor, cleanPromptText,
} from './rules.js';
import { chatJson, llmStatus } from './llm.js';
import { STAGES } from '../docSchema.js';
import { detectCameraShot } from './shots.js';

const byId = (arr, id) => (arr || []).find(x => x.id === id) || null;

// ─── sheet parsing helpers ───────────────────────────────────────────────────

function sheetLines(sheet) {
  return String(sheet || '').split('\n').map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^([^:]+):\s*(.+)$/); return m ? { k: m[1].trim(), v: m[2].trim() } : { k: '', v: l };
  });
}
function pickLines(lines, re) { return lines.filter(x => re.test(x.k) || re.test(x.v)).map(x => x.v); }

// Visual-only fields from the character sheet — everything else is story context.
const VISUAL_KEYS = /^(age|gender( presentation)?|height|body type|silhouette|face shape|skin(\/markings)?|hair style|hair color|eye shape|eye color|clothing style|main outfit|iconic item|distinctive features|accessories|color palette|ai prompt \(positive\))$/i;

function characterCtx(c) {
  const lines = sheetLines(c.sheet);
  const appearance = [...new Set(pickLines(lines, /^(age|gender( presentation)?|height|body type|silhouette|face shape|skin|hair style|hair color|eye shape|eye color)$/i))].join(', ') || c.role || c.name;
  const outfit = [...new Set(pickLines(lines, /^(clothing style|main outfit)$/i))].join(', ');
  const props = [...new Set(pickLines(lines, /^(iconic item|distinctive features|accessories)$/i))].join(', ');
  return { appearance, outfit, props, promptAddon: c.promptAddon, negativeAddon: c.negativeAddon };
}

/** A brief for the LLM that contains ONLY visual fields — story context is excluded. */
function characterVisualBrief(c) {
  const lines = sheetLines(c.sheet);
  const visual = lines.filter(x => VISUAL_KEYS.test(x.k));
  const aiHint = visual.filter(x => /ai prompt \(positive\)/i.test(x.k));   // gold-standard source hint first
  const rest   = visual.filter(x => !/ai prompt \(positive\)/i.test(x.k));
  const body = [...aiHint, ...rest].map(x => x.k ? `${x.k}: ${x.v}` : x.v).join('\n');
  return `Name: ${c.name}\nRole: ${c.role || ''}\n${body || c.sheet || ''}`;
}
function locationCtx(l) {
  const desc = String(l.description || '').replace(/\s+/g, ' ').trim();
  const sentences = desc.split(/(?<=[.!?])\s+/);
  return {
    appearance: sentences.slice(0, 2).join(' ') || l.name,
    lighting: (desc.match(/[^.]*\b(light|lit|glow|shadow|lamp|neon|sun|dim|bright)[^.]*\./i) || [''])[0].trim(),
    mood: l.type || '', promptAddon: l.promptAddon, negativeAddon: l.negativeAddon,
  };
}

// ─── deterministic detectors (work with zero LLM) ───────────────────────────

/** Every character mentioned anywhere in the panel — dialogue speakers + name/alias mentions. */
function detectCharacters(doc, panel) {
  const ids = new Set(panel.characters || []);
  for (const line of String(panel.dialogue || '').split('\n')) {
    const m = line.match(/^\s*([^:()]+?)\s*(?:\([^)]*\))?\s*:/);
    if (!m) continue;
    const name = m[1].toLowerCase().trim();
    const hit = (doc.characters || []).find(c => c.name.toLowerCase().startsWith(name) || (c.aliases || []).some(a => a.toLowerCase() === name));
    if (hit) ids.add(hit.id);
  }
  const haystack = [panel.visual, panel.action, panel.narration].filter(Boolean).join('\n').toLowerCase();
  if (haystack.trim()) for (const c of doc.characters || []) {
    for (const n of [c.name, ...(c.aliases || [])].map(x => String(x).toLowerCase().trim()).filter(x => x.length >= 3)) {
      if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(haystack)) { ids.add(c.id); break; }
    }
  }
  return [...ids];
}

/** Pick the location best matching the panel's text + its page's scene/location hint. */
function detectLocation(doc, page, panel) {
  if (!doc.locations?.length) return null;
  const haystack = [panel.visual, panel.action, panel.narration, page?.sceneLabel, page?.locationName].filter(Boolean).join('\n').toLowerCase();
  if (!haystack) return null;
  let best = null, bestScore = 0;
  for (const l of doc.locations) {
    const name = (l.name || '').toLowerCase().trim();
    if (!name) continue;
    let score = 0;
    if (name.length >= 3 && haystack.includes(name)) score += 10;
    for (const token of name.split(/\s+/)) if (token.length >= 4 && haystack.includes(token)) score += 2;
    if (l.type && haystack.includes(String(l.type).toLowerCase())) score += 1;
    if (score > bestScore) { best = l; bestScore = score; }
  }
  return bestScore >= 3 ? best : null;
}

// ─── LLM job #1: prose sheet → visual tag list (Cast & World) ────────────────

async function llmBatchEntities(doc, kind, items) {
  if (!llmStatus(doc).configured || !items.length) return new Map();
  const instr = llmInstructionsFor(kind, doc);
  const user = [
    instr, '',
    `Here are ${items.length} ${kind}(s). For EACH, return its prompt.`,
    `Output ONLY a JSON array: [{"id":"<id>","prompt":"<comma-separated tag list>"}, ...] — one object per id, same ids, nothing else.`,
    '',
    ...items.map((it, i) => `--- ${kind} ${i + 1} (id: ${it.id}) ---\n${it.brief}`),
  ].join('\n');
  const system = kind === 'character'
    ? 'You write strict visual-only comma-separated image-generation tag lists for a manga image model. Output ONLY comma-separated tags that describe what the eye sees — no story context, no mood, no setting, no personality, no narrative of any kind.'
    : 'You write terse, direct image-generation tag lists for a black-and-white manga maker. No prose, no sentences.';
  try {
    const arr = await chatJson({ system, user, maxTokens: Math.min(4000, 300 + items.length * 150), doc });
    const m = new Map();
    for (const o of (Array.isArray(arr) ? arr : [])) if (o && o.id && typeof o.prompt === 'string') m.set(String(o.id), o.prompt);
    return m;
  } catch (e) { console.warn(`[director] llmBatchEntities ${kind} failed — ${e.message}`); return new Map(); }
}

// ─── LLM job #2: prose mood → lighting/atmosphere tags (Pages) ───────────────

async function llmMoodLighting(doc, panels) {
  const need = panels.filter(p => p.mood && p.mood.trim());
  if (!llmStatus(doc).configured || !need.length) return new Map();
  const user = [
    `Translate each panel's prose mood into 3-5 visual lighting/atmosphere tags for a black-and-white manga panel.`,
    `Tags only — things like "dim lighting", "long shadows", "harsh backlight", "soft diffuse light", "high contrast", "empty background", "claustrophobic framing". No emotions, no story, no sentences.`,
    `Output ONLY a JSON array: [{"id":"<panelId>","tags":"<comma-separated tags>"},...]`,
    '',
    ...need.map(p => `id:${p.id} — ${String(p.mood).replace(/\n/g, ' ').slice(0, 160)}`),
  ].join('\n');
  try {
    const arr = await chatJson({
      system: 'You convert prose mood descriptions into short comma-separated visual lighting/atmosphere tag lists for a black-and-white manga. Output only the JSON array.',
      user, maxTokens: Math.min(1500, 100 + need.length * 40), doc,
    });
    const m = new Map();
    for (const o of (Array.isArray(arr) ? arr : [])) if (o?.id && typeof o.tags === 'string') m.set(String(o.id), cleanPromptText(o.tags, 120));
    return m;
  } catch (e) { console.warn(`[director] llmMoodLighting failed — ${e.message}`); return new Map(); }
}

// ─── shared: deterministically fill a panel's structural fields ─────────────

/** Mutate `panel` in place: fill any blank cameraShot / characters / locationId / mood. Returns true if anything changed. */
function fillPanelFields(doc, page, panel) {
  let changed = false;
  if (!panel.cameraShot || !panel.cameraShot.trim()) {
    // detect from the visual prose; if nothing is recognisable, fall back to a neutral medium shot
    panel.cameraShot = detectCameraShot([panel.visual, panel.action, panel.pacing].filter(Boolean).join(' '), '') || 'medium shot';
    changed = true;
  }
  const merged = detectCharacters(doc, panel);
  if (merged.length !== (panel.characters || []).length) { panel.characters = merged; changed = true; }
  if (!panel.locationId) {
    const loc = detectLocation(doc, page, panel);
    if (loc) { panel.locationId = loc.id; changed = true; }
  }
  if (!panel.mood || !panel.mood.trim()) { if (page?.mood) { panel.mood = page.mood; changed = true; } }
  return changed;
}

// ─── STAGE 1: story cleanup (deterministic) ─────────────────────────────────

export function aiCleanupStory(projectId) {
  return updateProject(projectId, doc => {
    let fixed = 0;
    const score = c => (c.imagePrompt && c.imagePrompt.trim() ? 2 : 0) + (c.sheet?.length || 0) / 1000;
    const winners = new Map();
    for (const c of doc.characters) {
      const k = c.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const cur = winners.get(k);
      if (!cur || score(c) > score(cur)) winners.set(k, c);
    }
    const remap = new Map();
    for (const c of doc.characters) {
      const k = c.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const w = winners.get(k);
      if (w && w.id !== c.id) { remap.set(c.id, w.id); fixed++; }
    }
    if (remap.size) {
      doc.characters = [...winners.values()];
      for (const p of doc.panels) p.characters = [...new Set((p.characters || []).map(id => remap.get(id) || id).filter(id => doc.characters.some(c => c.id === id)))];
    }
    for (const pg of doc.pages) if (!pg.sceneLabel || !pg.sceneLabel.trim()) { pg.sceneLabel = `Scene ${pg.number}`; fixed++; }
    for (const p of doc.panels) {
      if (!(p.visual && p.visual.trim()) && (p.action || p.narration)) { p.visual = (p.action || p.narration).slice(0, 200); fixed++; }
      // backfill camera shot from the (now-final) visual text
      if (!p.cameraShot || !p.cameraShot.trim()) { const s = detectCameraShot([p.visual, p.action].filter(Boolean).join(' '), ''); if (s) { p.cameraShot = s; fixed++; } }
    }
    addHistory(doc, 'ai:cleanup', { fixed });
    doc._lastCleanup = { at: new Date().toISOString(), fixed };
  }, { action: 'ai:cleanup' });
}

// ─── STAGE 2: fill cast & locations ─────────────────────────────────────────

export async function aiFillCast(projectId, { force = false } = {}) {
  const project = getProject(projectId);
  const usedLoc = new Set((project.panels || []).map(p => p.locationId).filter(Boolean));
  const chars = (project.characters || []).filter(c => !c.imagePromptLocked && (force || !(c.imagePrompt && c.imagePrompt.trim())));
  const locs = (project.locations || []).filter(l => !l.imagePromptLocked && usedLoc.has(l.id) && (force || !(l.imagePrompt && l.imagePrompt.trim())));
  const total = chars.length + locs.length;
  const jobId = createJob(projectId, 'ai:fillCast', null, total);
  if (total === 0) { updateJob(jobId, { status: 'done', progress: 1, message: 'Everything already filled.' }); return { jobId, total: 0 }; }

  const charLLM = await llmBatchEntities(project, 'character', chars.map(c => ({ id: c.id, brief: characterVisualBrief(c) })));
  const locLLM = await llmBatchEntities(project, 'location', locs.map(l => ({ id: l.id, brief: `Name: ${l.name}\nType: ${l.type || ''}\n${l.description || ''}` })));

  updateProject(projectId, doc => {
    for (const ref of chars) {
      const c = byId(doc.characters, ref.id); if (!c) continue;
      const ctx = characterCtx(c);
      const out = charLLM.has(c.id) ? finalizeLLMPrompt('character', charLLM.get(c.id), doc, ctx) : compilePrompt('character', ctx, doc);
      c.imagePrompt = out.prompt; c._promptSource = charLLM.has(c.id) ? 'llm' : 'compiled';
    }
    for (const ref of locs) {
      const l = byId(doc.locations, ref.id); if (!l) continue;
      const ctx = locationCtx(l);
      const out = locLLM.has(l.id) ? finalizeLLMPrompt('location', locLLM.get(l.id), doc, ctx) : compilePrompt('location', ctx, doc);
      l.imagePrompt = out.prompt; l._promptSource = locLLM.has(l.id) ? 'llm' : 'compiled';
    }
    addHistory(doc, 'ai:fillCast', { characters: chars.length, locations: locs.length, llm: charLLM.size + locLLM.size });
  }, { action: 'ai:fillCast' });
  updateJob(jobId, { status: 'done', progress: 1, total, message: `Filled ${chars.length} character(s) and ${locs.length} location(s).` });
  return { jobId, total, llmUsed: charLLM.size + locLLM.size };
}

export async function aiFillOneCharacter(projectId, characterId) {
  const project = getProject(projectId);
  const c = byId(project.characters, characterId); if (!c) throw new Error('character not found');
  const ctx = characterCtx(c);
  const llm = await llmBatchEntities(project, 'character', [{ id: c.id, brief: characterVisualBrief(c) }]);
  return updateProject(projectId, doc => {
    const x = byId(doc.characters, characterId);
    const out = llm.has(c.id) ? finalizeLLMPrompt('character', llm.get(c.id), doc, ctx) : compilePrompt('character', ctx, doc);
    x.imagePrompt = out.prompt; x._promptSource = llm.has(c.id) ? 'llm' : 'compiled';
    addHistory(doc, 'ai:fillCharacter', { id: characterId });
  }, { action: 'ai:fillCharacter' });
}
export async function aiFillOneLocation(projectId, locationId) {
  const project = getProject(projectId);
  const l = byId(project.locations, locationId); if (!l) throw new Error('location not found');
  const ctx = locationCtx(l);
  const llm = await llmBatchEntities(project, 'location', [{ id: l.id, brief: `Name: ${l.name}\nType: ${l.type || ''}\n${l.description || ''}` }]);
  return updateProject(projectId, doc => {
    const x = byId(doc.locations, locationId);
    const out = llm.has(l.id) ? finalizeLLMPrompt('location', llm.get(l.id), doc, ctx) : compilePrompt('location', ctx, doc);
    x.imagePrompt = out.prompt; x._promptSource = llm.has(l.id) ? 'llm' : 'compiled';
    addHistory(doc, 'ai:fillLocation', { id: locationId });
  }, { action: 'ai:fillLocation' });
}

// ─── STAGE 3: fill / compile pages ──────────────────────────────────────────

export async function aiFillPages(projectId, { pageId = null, force = false } = {}) {
  const project = getProject(projectId);
  const pages = (project.pages || []).filter(pg => !pageId || pg.id === pageId).sort((a, b) => a.number - b.number);
  const panelsByPage = id => (project.panels || []).filter(p => p.pageId === id).sort((a, b) => a.number - b.number);
  const total = pages.reduce((n, pg) => n + panelsByPage(pg.id).length, 0);
  const jobId = createJob(projectId, 'ai:fillPages', { pageId }, total);
  if (total === 0) { updateJob(jobId, { status: 'done', progress: 1, message: 'No panels to fill.' }); return { jobId, total: 0 }; }

  let done = 0, llmUsed = 0;
  for (const pg of pages) {
    const pagePanels = panelsByPage(pg.id);

    // PASS 1 — deterministic field fill (camera shot, cast, location, mood)
    updateProject(projectId, doc => {
      const page = byId(doc.pages, pg.id);
      for (const ref of pagePanels) { const p = byId(doc.panels, ref.id); if (p) fillPanelFields(doc, page, p); }
    }, { action: 'ai:fillFields', silent: true });

    // PASS 2 — one LLM call per page: prose mood → lighting tags
    const fp = getProject(projectId);
    const freshPanels = panelsByPage(pg.id).map(ref => fp.panels.find(x => x.id === ref.id)).filter(Boolean);
    const needPrompt = freshPanels.filter(p => !p.imagePromptLocked && (force || !(p.imagePrompt?.trim())));
    const moodMap = needPrompt.length ? await llmMoodLighting(fp, needPrompt) : new Map();
    llmUsed += moodMap.size;

    // PASS 3 — deterministic prompt assembly (render-mode aware)
    updateProject(projectId, doc => {
      for (const ref of freshPanels) {
        const p = byId(doc.panels, ref.id); if (!p) continue;
        if (!p.imagePromptLocked && (force || !(p.imagePrompt?.trim()))) {
          const out = compilePanelPrompt(doc, p, { moodLighting: moodMap.get(p.id) });
          p.imagePrompt = out.prompt; p.negativeAddon = p.negativeAddon || ''; p._promptStale = false;
          p._promptSource = 'compiled'; p._renderMode = out.mode;
        }
        done++;
      }
      addHistory(doc, 'ai:fillPages', { page: pg.number, panels: pagePanels.length });
    }, { action: 'ai:fillPages' });

    updateJob(jobId, { progress: done / total, total, message: `Page ${pg.number}…` });
  }
  updateJob(jobId, { status: 'done', progress: 1, total, message: `Compiled ${total} panel prompt(s)${llmUsed ? ` (${llmUsed} mood translation${llmUsed === 1 ? '' : 's'})` : ' from your rules'}.` });
  return { jobId, total, llmUsed };
}

export async function aiCompileOnePanel(projectId, panelId) {
  const project = getProject(projectId);
  const panel = byId(project.panels, panelId); if (!panel) throw new Error('panel not found');

  // PASS 1 — fields
  updateProject(projectId, doc => {
    const x = byId(doc.panels, panelId); const page = byId(doc.pages, x.pageId);
    fillPanelFields(doc, page, x);
  }, { action: 'ai:fillFields', silent: true });

  // PASS 2 — mood translation (single panel)
  const fp = getProject(projectId);
  const fresh = byId(fp.panels, panelId);
  const moodMap = await llmMoodLighting(fp, [fresh]);

  // PASS 3 — assemble
  return updateProject(projectId, doc => {
    const x = byId(doc.panels, panelId);
    const out = compilePanelPrompt(doc, x, { moodLighting: moodMap.get(panelId) });
    x.imagePrompt = out.prompt; x._promptStale = false; x._promptSource = 'compiled'; x._renderMode = out.mode;
    addHistory(doc, 'ai:compilePanel', { id: panelId, mode: out.mode });
  }, { action: 'ai:compilePanel' });
}

// ─── Auto-run the rest of the project ───────────────────────────────────────

const STAGE_LABEL = s => ({ story: 'Story', cast: 'Cast & World', pages: 'Pages', render: 'Render', letterExport: 'Letter & Export' }[s] || s);

export async function aiAutoRun(projectId) {
  const { renderBatch } = await import('../renderer.js');
  const { buildLetteringForPage } = await import('../lettering.js');
  const { advanceStage } = await import('../stages.js');

  const jobId = createJob(projectId, 'ai:autoRun', null, STAGES.length);
  const fail = msg => { updateJob(jobId, { status: 'done', progress: 1, error: msg, message: msg }); };

  (async () => {
    for (let guard = 0; guard < STAGES.length + 1; guard++) {
      const stage = getProject(projectId).currentStage;
      updateJob(jobId, { progress: STAGES.indexOf(stage) / STAGES.length, total: STAGES.length, message: `Working on ${STAGE_LABEL(stage)}…` });
      try {
        if (stage === 'story') aiCleanupStory(projectId);
        else if (stage === 'cast') await aiFillCast(projectId);
        else if (stage === 'pages') await aiFillPages(projectId, {});
        else if (stage === 'render') { const { errors } = await renderBatch(projectId, { wait: true }); if (errors.length) return fail(`Auto-run stopped: ${errors.length} panel render(s) failed — ${errors.map(e => e.error).slice(0, 2).join('; ')}`); }
        else if (stage === 'letterExport') {
          updateProject(projectId, doc => { for (const pg of doc.pages) { pg.lettering = buildLetteringForPage(doc, pg); pg._letteringStale = false; pg.approved = true; } addHistory(doc, 'ai:autoRun:finish'); }, { action: 'ai:autoRun' });
          return updateJob(jobId, { status: 'done', progress: 1, total: STAGES.length, message: 'Auto-run complete — every step is filled. Review the pages and export.' });
        }
      } catch (e) { return fail(`Auto-run stopped while filling "${STAGE_LABEL(stage)}": ${e.message}`); }
      try { advanceStage(projectId); }
      catch (e) { const detail = e.gate ? e.gate.blockers.slice(0, 4).map(b => `${b.label} — ${b.reason}`).join('; ') + (e.gate.blockers.length > 4 ? `, +${e.gate.blockers.length - 4} more` : '') : e.message; return fail(`Auto-run stopped at "${STAGE_LABEL(stage)}": ${detail}`); }
    }
    fail('Auto-run loop guard tripped (this should not happen).');
  })();
  return { jobId };
}
