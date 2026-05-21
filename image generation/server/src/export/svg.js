// export/svg.js — render a finished page to a standalone SVG with the panel art
// and lettering embedded (images as data URIs). One SVG per page; the export route
// also stores each as an asset so it shows up in the project's files.

import { getAsset } from '../db.js';

const PAGE_W = 1240, PAGE_H = 1754;   // ~A4 at 150dpi, manga-ish ratio
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const byId = (arr, id) => (arr || []).find(x => x.id === id) || null;
const pct = (v, total) => (Number(v) / 100) * total;

function dataUri(asset) {
  if (!asset) return null;
  return `data:${asset.mime};base64,${Buffer.from(asset.bytes).toString('base64')}`;
}

function wrap(text, perLine) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > perLine) { if (cur) lines.push(cur.trim()); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) lines.push(cur.trim());
  return lines.length ? lines : [''];
}

function letteringSvg(l) {
  const x = pct(l.x, PAGE_W), y = pct(l.y, PAGE_W) /* note: x/y/w in % of page WIDTH for consistent aspect */;
  // We treat the 0..100 lettering coords as percent of page width for x/w and a scaled height.
  const X = pct(l.x, PAGE_W), Y = pct(l.y, PAGE_H), W = pct(l.w, PAGE_W), H = pct(l.h, PAGE_H);
  const fs = Math.max(11, pct(l.fontSize || 3, PAGE_W));
  const perLine = Math.max(6, Math.floor(W / (fs * 0.55)));
  const lines = wrap(l.text, perLine);
  const cx = X + W / 2;
  const textBlock = lines.map((ln, i) => `<text x="${cx.toFixed(1)}" y="${(Y + fs * 1.1 + i * fs * 1.25).toFixed(1)}" text-anchor="middle" font-family="${l.type === 'sfx' ? 'Impact, Haettenschweiler, sans-serif' : 'Comic Sans MS, Comic Sans, ui-rounded, sans-serif'}" font-size="${(l.type === 'sfx' ? fs * 1.6 : fs).toFixed(1)}" font-weight="${l.type === 'sfx' || l.shout ? 'bold' : 'normal'}" font-style="${l.whisper ? 'italic' : 'normal'}" fill="#111">${esc(ln)}</text>`).join('');
  const transform = l.rotation ? ` transform="rotate(${l.rotation} ${cx.toFixed(1)} ${(Y + H / 2).toFixed(1)})"` : '';
  if (l.type === 'sfx') return `<g${transform}>${textBlock}</g>`;
  if (l.type === 'narration') return `<g${transform}><rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#fff" stroke="#111" stroke-width="2"/>${textBlock}</g>`;
  // speech / thought bubble
  const rx = l.type === 'thought' ? Math.min(W, H) / 2 : 14;
  const dash = l.type === 'thought' ? ' stroke-dasharray="2 4"' : '';
  return `<g${transform}><rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" rx="${rx}" ry="${rx}" fill="#fff" stroke="#111" stroke-width="${l.shout ? 3.5 : 2}"${dash}/>${textBlock}</g>`;
}

export function exportPageSvg(doc, page) {
  const panels = (doc.panels || []).filter(p => p.pageId === page.id);
  const cells = page.layout?.panels || [];
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`,
    `<rect width="100%" height="100%" fill="#fff"/>`];
  for (const cell of cells) {
    const panel = byId(panels, cell.panelId);
    const X = pct(cell.x, PAGE_W), Y = pct(cell.y, PAGE_H), W = pct(cell.w, PAGE_W), H = pct(cell.h, PAGE_H);
    const asset = panel?.render?.assetId ? getAsset(panel.render.assetId) : null;
    const href = dataUri(asset);
    parts.push(`<clipPath id="cp_${esc(cell.panelId)}"><rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}"/></clipPath>`);
    if (href) parts.push(`<image href="${href}" x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" preserveAspectRatio="xMidYMid slice" clip-path="url(#cp_${esc(cell.panelId)})"/>`);
    else parts.push(`<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#eee"/><text x="${(X + W / 2).toFixed(1)}" y="${(Y + H / 2).toFixed(1)}" text-anchor="middle" font-family="serif" font-size="20" fill="#999">panel ${panel?.number ?? '?'} — not rendered</text>`);
    parts.push(`<rect x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="none" stroke="#000" stroke-width="4"/>`);
  }
  for (const l of (page.lettering || [])) parts.push(letteringSvg(l));
  parts.push(`</svg>`);
  return parts.join('\n');
}

export function exportAllPages(doc) {
  return (doc.pages || []).sort((a, b) => a.number - b.number).map(pg => ({ pageId: pg.id, number: pg.number, title: pg.sceneLabel, svg: exportPageSvg(doc, pg) }));
}
