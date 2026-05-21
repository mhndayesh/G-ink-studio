// layout.js — page panel layout. Coordinates are in a 0..100 box (percent of page),
// origin top-left. Reading direction defaults to RTL (manga); the grid fills
// right-to-left, top-to-bottom so panel order reads naturally.

export const LAYOUT_TEMPLATES = ['auto', 'single', 'rows', 'grid-2', 'grid-2x3', 'custom'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));

/** Sanitise a user-supplied set of layout cells: keep only cells for the given panel ids,
 *  clamp every rect into the page box with a minimum size, fill in any missing panels. */
export function sanitizeCells(cells, panelIds) {
  const byId = new Map((cells || []).map(c => [c.panelId, c]));
  const out = [];
  panelIds.forEach((panelId, i) => {
    const c = byId.get(panelId);
    if (c) {
      const w = clamp(c.w, 5, 100), h = clamp(c.h, 5, 100);
      out.push({ panelId, x: +clamp(c.x, 0, 100 - w).toFixed(2), y: +clamp(c.y, 0, 100 - h).toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2) });
    } else {
      // a panel with no supplied cell: drop it under the others as a full-width strip
      const y = Math.min(92, 4 + i * 14);
      out.push({ panelId, x: 4, y, w: 92, h: 12 });
    }
  });
  return out;
}

function columnsFor(n) {
  if (n <= 1) return 1;
  if (n <= 3) return 1;          // tall stacked rows read best for 2-3 panels
  if (n <= 6) return 2;
  return 2;
}

/** Build an auto grid layout for the given ordered panel ids. */
export function gridLayout(panelIds, { template = 'auto', readingDir = 'rtl' } = {}) {
  const ids = panelIds.slice();
  const n = ids.length;
  if (n === 0) return { template, readingDir, panels: [] };

  let cols;
  if (template === 'single') cols = 1;
  else if (template === 'rows') cols = 1;
  else if (template === 'grid-2') cols = 2;
  else if (template === 'grid-2x3') cols = 2;
  else cols = columnsFor(n);

  const rows = Math.ceil(n / cols);
  const cellW = 100 / cols;
  const gap = 1.5;
  const panels = ids.map((panelId, i) => {
    const r = Math.floor(i / cols);
    const cInRow = i % cols;
    const colsThisRow = Math.min(cols, n - r * cols);
    const w = 100 / colsThisRow;
    // RTL: first panel in a row sits on the right edge.
    const xLtr = cInRow * w;
    const x = readingDir === 'rtl' ? 100 - w - xLtr : xLtr;
    const rowH = 100 / rows;
    return {
      panelId,
      x: +(x + gap / 2).toFixed(2),
      y: +(r * rowH + gap / 2).toFixed(2),
      w: +(w - gap).toFixed(2),
      h: +(rowH - gap).toFixed(2),
    };
  });
  return { template, readingDir, panels };
}

/** Re-flow a page's layout (e.g. after panels are added/removed/reordered). */
export function relayoutPage(page, orderedPanelIds) {
  page.layout = gridLayout(orderedPanelIds, { template: page.layout?.template || 'auto', readingDir: page.layout?.readingDir || 'rtl' });
  return page;
}
