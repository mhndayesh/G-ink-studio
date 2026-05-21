// lettering.js — auto-place speech/thought bubbles, narration boxes and SFX text
// over a page's panels. Coordinates are in the same 0..100 page box used by layout.
// Heuristic but deterministic; the user nudges things afterwards in the UI.

import { getRule } from './ai/rules.js';
import { localId } from './docSchema.js';

const byId = (arr, id) => (arr || []).find(x => x.id === id) || null;

function parseDialogue(dialogue) {
  const out = [];
  for (const line of String(dialogue || '').split('\n')) {
    const m = line.match(/^\s*([^:()]+?)\s*(\(([^)]*)\))?\s*:\s*"?(.+?)"?\s*$/);
    if (!m) continue;
    const speaker = m[1].trim();
    const tag = (m[3] || '').toLowerCase();
    const text = m[4].trim();
    if (!text) continue;
    const type = /thought|think/.test(tag) ? 'thought' : 'speech';
    out.push({ speaker, type, text, whisper: /whisper/.test(tag), shout: /shout|yell/.test(tag) });
  }
  return out;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Build lettering objects for one page. Returns the array (does not mutate). */
export function buildLetteringForPage(doc, page) {
  const rule = getRule('lettering', doc);
  const panels = (doc.panels || []).filter(p => p.pageId === page.id).sort((a, b) => a.number - b.number);
  const cells = new Map((page.layout?.panels || []).map(c => [c.panelId, c]));
  const items = [];

  for (const panel of panels) {
    const cell = cells.get(panel.id) || { x: 5, y: 5, w: 90, h: 90 };
    const innerX = cell.x + cell.w * 0.06, innerW = cell.w * 0.88;
    let cursorY = cell.y + cell.h * 0.05;

    // narration first (top strip)
    if (panel.narration && panel.narration.trim()) {
      const lines = Math.max(1, Math.ceil(panel.narration.trim().length / rule.maxLineChars));
      const h = clamp(lines * (rule.narrationFontSize * 1.5), 5, cell.h * 0.4);
      items.push({ id: localId('let'), panelId: panel.id, type: 'narration', text: panel.narration.trim(), x: +innerX.toFixed(2), y: +cursorY.toFixed(2), w: +(innerW * 0.62).toFixed(2), h: +h.toFixed(2), fontSize: rule.narrationFontSize, rotation: 0, speaker: null });
      cursorY += h + cell.h * 0.02;
    }

    // speech / thought bubbles, stacked from where narration left off, alternating side
    const lines = parseDialogue(panel.dialogue);
    lines.forEach((d, i) => {
      const approxLines = Math.max(1, Math.ceil(d.text.length / rule.maxLineChars));
      const w = clamp(innerW * (d.text.length > rule.maxLineChars ? 0.55 : 0.42), innerW * 0.3, innerW * 0.6);
      const h = clamp(approxLines * (rule.speechFontSize * 1.6) + rule.bubblePadding * 2, 6, cell.h * 0.45);
      const side = i % 2 === 0 ? innerX : (cell.x + cell.w - cell.w * 0.06 - w);
      const y = clamp(cursorY, cell.y, cell.y + cell.h - h - cell.h * 0.04);
      items.push({ id: localId('let'), panelId: panel.id, type: d.type, text: d.text, x: +side.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2), fontSize: d.shout ? rule.speechFontSize * 1.25 : d.whisper ? rule.speechFontSize * 0.85 : rule.speechFontSize, rotation: 0, speaker: d.speaker, whisper: d.whisper, shout: d.shout });
      cursorY = y + h + cell.h * 0.025;
    });

    // SFX — bottom corner, slight tilt
    if (panel.sfxText && panel.sfxText.trim()) {
      const word = panel.sfxText.split(/[\s(]/)[0] || panel.sfxText.trim();
      const w = clamp(word.length * (rule.sfxFontSize * 0.62), 8, cell.w * 0.6);
      items.push({ id: localId('let'), panelId: panel.id, type: 'sfx', text: word.toUpperCase(), x: +clamp(cell.x + cell.w * 0.5 - w / 2, cell.x, cell.x + cell.w - w).toFixed(2), y: +clamp(cell.y + cell.h * 0.66, cell.y, cell.y + cell.h - rule.sfxFontSize * 1.6).toFixed(2), w: +w.toFixed(2), h: +(rule.sfxFontSize * 1.6).toFixed(2), fontSize: rule.sfxFontSize, rotation: -8, speaker: null });
    }
  }
  return items;
}

/** QC a single panel against the obvious hard requirements + a couple of soft hints. */
export function qcPanel(doc, panel) {
  const issues = [];
  if (!panel.imagePrompt || !panel.imagePrompt.trim()) issues.push({ level: 'hard', msg: 'No compiled image prompt' });
  if (!panel.cameraShot || !panel.cameraShot.trim()) issues.push({ level: 'hard', msg: 'No camera shot' });
  if (!(panel.render && panel.render.status === 'done' && panel.render.assetId)) issues.push({ level: 'hard', msg: 'Not rendered' });
  if (panel._renderStale) issues.push({ level: 'hard', msg: 'Render is stale' });
  const hasText = !!((panel.dialogue && panel.dialogue.trim()) || (panel.narration && panel.narration.trim()));
  if (hasText && !/empty space|clear space|for text|for speech|leave room/i.test(panel.imagePrompt || '')) issues.push({ level: 'soft', msg: 'Dialogue/narration present but prompt does not reserve space for lettering' });
  if ((panel.characters || []).length === 0 && !/no people|empty|landscape|establishing/i.test(panel.visual || '')) issues.push({ level: 'soft', msg: 'No characters assigned — confirm this is intentional' });
  const hard = issues.some(i => i.level === 'hard');
  return { status: hard ? 'needs_fix' : 'passed', issues };
}
