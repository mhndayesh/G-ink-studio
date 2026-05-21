// docSchema.js — the single source of truth for the project document shape.
//
// A small hand-rolled validator (no external deps). It checks the structural
// invariants the rest of the app relies on; updateProject() runs it on every
// mutation so a buggy mutator can never persist a corrupt document.
//
// Keep this in sync with web/src/lib/types.ts (a server test asserts they agree
// on required top-level keys).

export const STAGES = ['story', 'cast', 'pages', 'render', 'letterExport'];
export const RENDER_MODES = ['auto', 't2i', 'i2i', 'i2i-2refs'];
export const LETTERING_TYPES = ['speech', 'thought', 'narration', 'sfx'];

// The single canonical camera-shot vocabulary. The Pages dropdown, the ingest
// parser, and the deterministic shot detector all use exactly this list. An
// empty string ('') means "not set yet" and is the only other legal value.
export const CAMERA_SHOTS = [
  'extreme close-up', 'close-up', 'medium close-up', 'medium shot', 'cowboy shot',
  'wide shot', 'establishing shot', 'low angle shot', 'high angle shot',
  'over-the-shoulder shot', 'two-shot', "bird's-eye view",
];
const CAMERA_SHOT_SET = new Set(CAMERA_SHOTS);
export const isCameraShot = v => v === '' || CAMERA_SHOT_SET.has(v);

const isStr = v => typeof v === 'string';
const isArr = Array.isArray;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

export function validateDocument(doc) {
  const errs = [];
  const E = m => errs.push(m);

  if (!isObj(doc)) { return ['document is not an object']; }
  if (!isStr(doc.id) || !doc.id) E('id missing');
  if (!isStr(doc.title) || !doc.title) E('title missing');
  if (!STAGES.includes(doc.currentStage)) E(`currentStage must be one of ${STAGES.join('|')}`);
  if (!isObj(doc.systemRule) || !isStr(doc.systemRule.positive)) E('systemRule.positive missing');
  if (!isObj(doc.aiSettings)) E('aiSettings missing');

  for (const key of ['characters', 'locations', 'chapters', 'pages', 'panels', 'history']) {
    if (!isArr(doc[key])) E(`${key} must be an array`);
  }

  const charIds = new Set();
  for (const c of doc.characters || []) {
    if (!isStr(c.id) || charIds.has(c.id)) E(`character id duplicate/missing: ${c.id}`);
    charIds.add(c.id);
    if (!isStr(c.name)) E(`character ${c.id} name missing`);
  }
  const locIds = new Set();
  for (const l of doc.locations || []) {
    if (!isStr(l.id) || locIds.has(l.id)) E(`location id duplicate/missing: ${l.id}`);
    locIds.add(l.id);
  }
  const chIds = new Set();
  for (const ch of doc.chapters || []) {
    if (!isStr(ch.id) || chIds.has(ch.id)) E(`chapter id duplicate/missing: ${ch.id}`);
    chIds.add(ch.id);
    if (!isArr(ch.pageIds)) E(`chapter ${ch.id} pageIds missing`);
  }
  const pageIds = new Set();
  for (const p of doc.pages || []) {
    if (!isStr(p.id) || pageIds.has(p.id)) E(`page id duplicate/missing: ${p.id}`);
    pageIds.add(p.id);
    if (!chIds.has(p.chapterId)) E(`page ${p.id} references unknown chapter ${p.chapterId}`);
    if (!isObj(p.layout)) E(`page ${p.id} layout missing`);
    if (!isArr(p.lettering)) E(`page ${p.id} lettering must be an array`);
  }
  const panelIds = new Set();
  for (const pn of doc.panels || []) {
    if (!isStr(pn.id) || panelIds.has(pn.id)) E(`panel id duplicate/missing: ${pn.id}`);
    panelIds.add(pn.id);
    if (!pageIds.has(pn.pageId)) E(`panel ${pn.id} references unknown page ${pn.pageId}`);
    if (pn.renderMode && !RENDER_MODES.includes(pn.renderMode)) E(`panel ${pn.id} bad renderMode`);
    if (pn.cameraShot != null && !isCameraShot(pn.cameraShot)) E(`panel ${pn.id} bad cameraShot "${pn.cameraShot}" — must be '' or one of ${CAMERA_SHOTS.join('|')}`);
    for (const cid of pn.characters || []) if (!charIds.has(cid)) E(`panel ${pn.id} references unknown character ${cid}`);
    if (pn.locationId && !locIds.has(pn.locationId)) E(`panel ${pn.id} references unknown location ${pn.locationId}`);
  }
  return errs;
}

let _seq = 0;
const localId = prefix => `${prefix}_${Date.now().toString(36)}${(_seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Build a brand-new, empty-but-valid project document. */
export function newProjectDoc(title = 'Untitled Manga') {
  return {
    id: localId('proj'),
    title,
    currentStage: 'story',
    createdAt: new Date().toISOString(),
    systemRule: {
      positive: 'manga style, black and white, screentone shading, clean bold ink lines, high contrast',
      negative: 'color, colored, photo, photorealistic, 3d render, cgi, watermark, signature, text artifacts, extra fingers, extra limbs, malformed hands, lowres, blurry, jpeg artifacts',
    },
    ruleOverrides: {},                 // optional per-project tweaks to the rule files
    aiSettings: { provider: 'auto', model: '', autoApprove: false, autoLetter: true },
    synopsis: '',
    genre: '',
    worldNotes: '',
    characters: [],
    locations: [],
    chapters: [],
    pages: [],
    panels: [],
    history: [],
  };
}

export { localId };
