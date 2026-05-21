// ingest/index.js — turn the 3-file asset bundle (story / visuals / scenes) into
// a fresh, valid project document. The visuals file carries the full structured
// chapter→page→panel breakdown + per-character/location "AI prompt (positive)"
// strings (already direct, comma-separated); the story file adds synopsis, genre,
// world notes, character backstories and relationships.

import { parseStoryFile } from './parseStory.js';
import { parseVisualsFile } from './parseVisuals.js';
import { newProjectDoc, localId } from '../docSchema.js';
import { gridLayout } from '../layout.js';
import { detectCameraShot } from '../ai/shots.js';

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const idify = (prefix, name) => `${prefix}_${norm(name).replace(/\s+/g, '_') || localId('x')}`;

/** Build a readable character "sheet" from the parsed visuals fields. */
function sheetFromFields(fields = {}) {
  const skip = new Set(['AI prompt (positive)', 'AI prompt (negative)']);
  return Object.entries(fields).filter(([k]) => !skip.has(k)).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** Pull speaker names out of a panel's dialogue block: "oddo: \"...\"" / "kinji sato (Thought): \"...\"". */
function dialogueSpeakers(dialogue) {
  const out = [];
  for (const line of String(dialogue || '').split('\n')) {
    const m = line.match(/^\s*([^:()]+?)\s*(?:\([^)]*\))?\s*:/);
    if (m && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

/** preview = parse only, no project created. Used by the Story stage's "review" screen. */
export function previewIngest({ story, visuals }) {
  const s = story ? parseStoryFile(story) : null;
  const v = visuals ? parseVisualsFile(visuals) : null;
  const chapters = v?.chapters || [];
  return {
    title: s?.title || 'Imported Manga',
    genre: s?.genre || '',
    synopsis: s?.synopsis || '',
    counts: {
      characters: (v?.characters || s?.characters || []).length,
      locations: (v?.locations || []).length,
      chapters: chapters.length,
      pages: chapters.reduce((n, c) => n + (c.pages || []).length, 0),
      panels: chapters.reduce((n, c) => n + (c.pages || []).reduce((m, p) => m + (p.panels || []).length, 0), 0),
    },
    characters: (v?.characters || []).map(c => ({ name: c.name, role: c.role, hasPrompt: !!c.positivePrompt })),
    locations: (v?.locations || []).map(l => ({ name: l.name, type: l.type, hasPrompt: !!l.positivePrompt })),
    chapters: chapters.map(c => ({ number: c.number, title: c.title, pages: (c.pages || []).length })),
  };
}

/** Build the full project document from the bundle. */
export function buildProjectFromBundle({ story, visuals }, { title } = {}) {
  const s = story ? parseStoryFile(story) : {};
  const v = visuals ? parseVisualsFile(visuals) : {};
  const doc = newProjectDoc(title || s.title || 'Imported Manga');

  doc.genre = s.genre || '';
  doc.synopsis = s.synopsis || '';
  doc.worldNotes = [
    s.world && Object.entries(s.world).map(([k, val]) => `${k}: ${val}`).join('\n'),
    s.threats && '\nThreats:\n' + Object.entries(s.threats).map(([k, val]) => `${k}: ${val}`).join('\n'),
    s.arcOverview?.summary && `\nArc: ${s.arcOverview.title} — ${s.arcOverview.summary}`,
  ].filter(Boolean).join('\n');

  // ─ characters ─ (visuals carry the look; story carries backstory/traits) ─
  const storyChars = new Map((s.characters || []).map(c => [norm(c.name), c]));
  const charByName = new Map();
  for (const vc of (v.characters || [])) {
    const sc = storyChars.get(norm(vc.name)) || {};
    const id = idify('char', vc.name);
    const c = {
      id, name: vc.name, role: vc.role || sc.role || '',
      aliases: [],
      sheet: [sheetFromFields(vc.fields), sc.backstory && `Backstory: ${sc.backstory}`, sc.traits?.length && `Traits: ${sc.traits.join(', ')}`].filter(Boolean).join('\n'),
      imagePrompt: (vc.positivePrompt || '').trim(),
      imagePromptLocked: false,
      promptAddon: '',
      negativeAddon: (vc.negativePrompt || '').trim(),
      refs: [],
    };
    doc.characters.push(c);
    charByName.set(norm(vc.name), c);
  }
  // story-only characters that never got a visual sheet
  for (const sc of (s.characters || [])) {
    if (charByName.has(norm(sc.name))) continue;
    const id = idify('char', sc.name);
    const c = { id, name: sc.name, role: sc.role || '', aliases: [], sheet: [sc.backstory && `Backstory: ${sc.backstory}`, sc.traits?.length && `Traits: ${sc.traits.join(', ')}`].filter(Boolean).join('\n'), imagePrompt: '', imagePromptLocked: false, promptAddon: '', negativeAddon: '', refs: [] };
    doc.characters.push(c);
    charByName.set(norm(sc.name), c);
  }
  // a couple of obvious aliases (oddo/odo)
  for (const c of doc.characters) {
    const base = norm(c.name).split(' ')[0];
    if (base && base !== norm(c.name)) c.aliases.push(base);
  }

  // ─ locations ─
  const locByName = new Map();
  for (const vl of (v.locations || [])) {
    const id = idify('loc', vl.name);
    const l = { id, name: vl.name, type: vl.type || '', description: vl.description || '', imagePrompt: (vl.positivePrompt || '').trim(), imagePromptLocked: false, promptAddon: '', negativeAddon: (vl.negativePrompt || '').trim(), refs: [] };
    doc.locations.push(l);
    locByName.set(norm(vl.name), l);
  }
  const findLocation = name => {
    if (!name) return null;
    const n = norm(name);
    if (locByName.has(n)) return locByName.get(n);
    for (const [k, l] of locByName) if (k.includes(n) || n.includes(k)) return l;
    return null;
  };

  // ─ chapters / pages / panels ─
  const matchChar = nameOrAlias => {
    const n = norm(nameOrAlias);
    if (charByName.has(n)) return charByName.get(n).id;
    for (const c of doc.characters) { if (norm(c.name).startsWith(n) || c.aliases.some(a => norm(a) === n)) return c.id; }
    return null;
  };
  // characters whose name/alias is mentioned in free text (visual / action / narration)
  const mentionedChars = text => {
    const hay = String(text || '').toLowerCase();
    if (!hay.trim()) return [];
    const ids = [];
    for (const c of doc.characters) {
      for (const nm of [c.name, ...(c.aliases || [])].map(x => String(x).toLowerCase().trim()).filter(x => x.length >= 3)) {
        if (new RegExp(`\\b${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay)) { ids.push(c.id); break; }
      }
    }
    return ids;
  };

  for (const ch of (v.chapters || [])) {
    const chId = idify('ch', `${ch.number}_${ch.title}`);
    const pageIds = [];
    for (const pg of (ch.pages || [])) {
      const pgId = `${chId}_pg${pg.number}`;
      const panelIds = [];
      const loc = findLocation(pg.locationName);   // one location per scene/page
      for (const pn of (pg.panels || [])) {
        const pnId = `${pgId}_pn${pn.number}`;
        const speakers = dialogueSpeakers(pn.dialogue);
        const chars = [...new Set([
          ...speakers.map(matchChar).filter(Boolean),
          ...mentionedChars([pn.visual, pn.characterAction, pn.narration].filter(Boolean).join(' ')),
        ])];
        // camera shot: detect from the visual prose (and the "[Medium / X / Y]" header tokens as a hint)
        const cameraShot = detectCameraShot([pn.visual, pn.size, pn.cameraShot].filter(Boolean).join(' '), '');
        doc.panels.push({
          id: pnId, number: pn.number, pageId: pgId, chapterId: chId, sceneId: pg.sceneLabel || '',
          visual: pn.visual || '', action: pn.characterAction || '', mood: pn.mood || pg.mood || '',
          cameraShot, pacing: pn.pacing || '',
          background: pn.backgroundDetails || '', facialExpression: pn.facialExpression || '', pose: pn.poseOrBodyLanguage || '',
          characters: chars, locationId: loc ? loc.id : null,
          narration: pn.narration || '', dialogue: pn.dialogue || '', sfxText: pn.sfxText || '',
          dialogueCount: speakers.length,
          imagePrompt: '', imagePromptLocked: false, promptAddon: '', negativeAddon: '',
          renderMode: ['t2i', 'i2i'].includes((pn.renderMode || '').trim()) ? pn.renderMode.trim() : 'auto',
          render: { status: 'none', model: null, seed: null, assetId: null, imageUrl: null, renderId: null, error: null },
          _promptStale: false, _renderStale: false,
          qc: { status: 'unchecked', issues: [] },
        });
        panelIds.push(pnId);
      }
      doc.pages.push({
        id: pgId, number: pg.number, chapterId: chId,
        sceneLabel: pg.sceneLabel || `Scene ${pg.number}`, scenePurpose: pg.purpose || '', mood: pg.mood || '',
        layout: gridLayout(panelIds),
        lettering: [], approved: false, _letteringStale: false,
      });
      pageIds.push(pgId);
    }
    doc.chapters.push({ id: chId, number: ch.number, title: ch.title, status: ch.status || 'draft', pageIds });
  }

  return doc;
}
