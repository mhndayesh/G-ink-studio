// stages.js — the strict linear workflow. Owns the stage order, the gate that
// must pass to leave each stage, and the staleness cascade when the user goes
// backward. There is intentionally NO "skip the gate" escape hatch.

import { STAGES } from './docSchema.js';
import { updateProject, addHistory } from './db.js';

export { STAGES };

export const STAGE_META = {
  story:        { index: 0, title: 'Story',          blurb: 'Import your manga and review the parsed chapters, pages, panels and cast.' },
  cast:         { index: 1, title: 'Cast & World',   blurb: 'Lock in how every character and location looks, plus the global style.' },
  pages:        { index: 2, title: 'Pages',          blurb: 'Lay out the panels and compile the direct image prompt for each one.' },
  render:       { index: 3, title: 'Render',         blurb: 'Generate the panel artwork.' },
  letterExport: { index: 4, title: 'Letter & Export', blurb: 'Place the lettering, approve the pages, export the book.' },
};

const stageIndex = s => STAGES.indexOf(s);
const usedLocationIds = doc => new Set((doc.panels || []).map(p => p.locationId).filter(Boolean));

function panelHasSource(p) {
  return !!((p.visual && p.visual.trim()) || (p.narration && p.narration.trim()) || (p.dialogue && p.dialogue.trim()) || (p.action && p.action.trim()));
}
function renderOk(p) {
  return p.render && p.render.status === 'done' && !!p.render.assetId && !p._renderStale;
}

/**
 * Evaluate the gate that must pass to LEAVE `stage`.
 * Returns { ok, blockers: [{ kind, id, label, reason, jump }] }.
 */
export function evalGate(doc, stage) {
  const blockers = [];
  const add = (kind, id, label, reason, jump) => blockers.push({ kind, id, label, reason, jump });

  if (stage === 'story') {
    if (!(doc.chapters || []).length) add('story', null, 'Story', 'No chapters imported yet', { stage: 'story' });
    if (!(doc.pages || []).length) add('story', null, 'Story', 'No pages imported yet', { stage: 'story' });
    if (!(doc.panels || []).length) add('story', null, 'Story', 'No panels imported yet', { stage: 'story' });
    for (const p of doc.panels || []) if (!panelHasSource(p)) add('panel', p.id, `Panel ${p.number}`, 'has no visual / dialogue / narration to work from', { stage: 'story', panelId: p.id });
  }

  if (stage === 'cast') {
    for (const c of doc.characters || []) if (!c.imagePrompt || !c.imagePrompt.trim()) add('character', c.id, c.name, 'has no image prompt — run AI fill or write one', { stage: 'cast', characterId: c.id });
    const used = usedLocationIds(doc);
    for (const l of doc.locations || []) if (used.has(l.id) && (!l.imagePrompt || !l.imagePrompt.trim())) add('location', l.id, l.name, 'is used in a panel but has no image prompt', { stage: 'cast', locationId: l.id });
  }

  if (stage === 'pages') {
    for (const p of doc.panels || []) {
      if (!p.cameraShot || !p.cameraShot.trim()) add('panel', p.id, `Panel ${p.number}`, 'has no camera shot', { stage: 'pages', panelId: p.id });
      if (!p.imagePrompt || !p.imagePrompt.trim()) add('panel', p.id, `Panel ${p.number}`, 'has no compiled image prompt', { stage: 'pages', panelId: p.id });
    }
  }

  if (stage === 'render') {
    for (const p of doc.panels || []) if (!renderOk(p)) add('panel', p.id, `Panel ${p.number}`, p._renderStale ? 'render is stale — re-render it' : 'has not been rendered yet', { stage: 'render', panelId: p.id });
  }

  if (stage === 'letterExport') {
    for (const pg of doc.pages || []) {
      if (!(pg.lettering || []).length) add('page', pg.id, `Page ${pg.number}`, 'has no lettering placed', { stage: 'letterExport', pageId: pg.id });
      if (!pg.approved) add('page', pg.id, `Page ${pg.number}`, 'is not approved yet', { stage: 'letterExport', pageId: pg.id });
    }
  }

  return { ok: blockers.length === 0, blockers };
}

/** Which stages are "unlocked" for navigation: every stage up to and including currentStage. */
export function unlockedStages(doc) {
  const cur = stageIndex(doc.currentStage);
  return STAGES.map((s, i) => ({ stage: s, ...STAGE_META[s], unlocked: i <= cur, current: i === cur, done: i < cur }));
}

/** Mark everything that depends on stages >= `fromStageIndex` as needing rework. */
function cascadeStaleness(doc, targetStage) {
  const ti = stageIndex(targetStage);
  // Going back to 'story' or 'cast' → panel prompts are no longer trustworthy.
  if (ti <= stageIndex('cast')) {
    for (const c of doc.characters || []) if (!c.imagePromptLocked && ti < stageIndex('cast')) {/* keep cast prompts; cast IS the target */}
    for (const p of doc.panels || []) { if (!p.imagePromptLocked) p._promptStale = true; }
  }
  // Going back to or before 'pages' → renders are stale.
  if (ti <= stageIndex('pages')) {
    for (const p of doc.panels || []) { p._renderStale = true; if (p.render) p.render.status = p.render.status === 'done' ? 'stale' : p.render.status; if (p.qc) p.qc.status = 'unchecked'; }
  }
  // Going back to or before 'render' → lettering & approvals reset.
  if (ti <= stageIndex('render')) {
    for (const pg of doc.pages || []) { pg.approved = false; pg._letteringStale = (pg.lettering || []).length > 0; }
  }
}

export function advanceStage(projectId) {
  return updateProject(projectId, doc => {
    const i = stageIndex(doc.currentStage);
    if (i >= STAGES.length - 1) throw new Error('Already at the final stage');
    const gate = evalGate(doc, doc.currentStage);
    if (!gate.ok) { const e = new Error('Stage gate not satisfied'); e.gate = { stage: doc.currentStage, blockers: gate.blockers }; e.status = 409; throw e; }
    doc.currentStage = STAGES[i + 1];
    addHistory(doc, 'stage:advance', { to: doc.currentStage });
  }, { action: 'stage:advance' });
}

export function revertStage(projectId, targetStage) {
  return updateProject(projectId, doc => {
    const ci = stageIndex(doc.currentStage);
    const ti = stageIndex(targetStage);
    if (ti < 0 || ti >= ci) throw new Error('revert target must be an earlier stage');
    cascadeStaleness(doc, targetStage);
    doc.currentStage = targetStage;
    addHistory(doc, 'stage:revert', { to: targetStage });
  }, { action: 'stage:revert' });
}
