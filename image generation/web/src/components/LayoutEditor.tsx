import { useEffect, useRef, useState } from 'react';
import type { Page, Panel, LayoutCell } from '../lib/types';

type Cell = LayoutCell;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const snap = (v: number) => Math.round(v * 2) / 2;

/** Drag to move, drag the corner handle to resize. Calls onSave(cells) on each drop. */
export function LayoutEditor({ page, panels, onSave, onSelect, selPanelId }: { page: Page; panels: Panel[]; onSave: (cells: Cell[]) => void; onSelect?: (id: string) => void; selPanelId?: string | null }) {
  const [cells, setCells] = useState<Cell[]>(page.layout.panels.map(c => ({ ...c })));
  useEffect(() => { setCells(page.layout.panels.map(c => ({ ...c }))); }, [page.id, JSON.stringify(page.layout.panels)]);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'resize'; sx: number; sy: number; start: Cell } | null>(null);
  const byPanel = (id: string) => panels.find(p => p.id === id);

  function pct(e: PointerEvent | React.PointerEvent) {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100, w: r.width, h: r.height };
  }
  function onDown(e: React.PointerEvent, id: string, mode: 'move' | 'resize') {
    e.preventDefault(); e.stopPropagation();
    onSelect?.(id);
    const cur = cells.find(c => c.panelId === id)!;
    const p = pct(e);
    drag.current = { id, mode, sx: p.x, sy: p.y, start: { ...cur } };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }
  function onMove(e: PointerEvent) {
    if (!drag.current) return;
    const d = drag.current; const p = pct(e);
    const dx = p.x - d.sx, dy = p.y - d.sy;
    setCells(cs => cs.map(c => {
      if (c.panelId !== d.id) return c;
      if (d.mode === 'move') return { ...c, x: snap(clamp(d.start.x + dx, 0, 100 - d.start.w)), y: snap(clamp(d.start.y + dy, 0, 100 - d.start.h)) };
      const w = snap(clamp(d.start.w + dx, 5, 100 - d.start.x)), h = snap(clamp(d.start.h + dy, 5, 100 - d.start.y));
      return { ...c, w, h };
    }));
  }
  function onUp() { window.removeEventListener('pointermove', onMove); const cur = cellsRef.current; drag.current = null; onSave(cur); }
  // keep a ref of the latest cells so onUp (a stable closure) sees them
  const cellsRef = useRef(cells); cellsRef.current = cells;

  return (
    <div ref={ref} className="pagecanvas" style={{ touchAction: 'none', userSelect: 'none' }}>
      {cells.map(c => {
        const pn = byPanel(c.panelId);
        return (
          <div key={c.panelId} className={`cell ${selPanelId === c.panelId ? 'sel' : ''}`} style={{ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%`, cursor: 'grab', background: '#eef0ff' }}
            onPointerDown={e => onDown(e, c.panelId, 'move')}>
            <span className="cnum">{pn?.number ?? '?'}</span>
            <div className="ph">{pn?.visual?.slice(0, 60) || 'panel'}</div>
            <div onPointerDown={e => onDown(e, c.panelId, 'resize')} style={{ position: 'absolute', right: 0, bottom: 0, width: 16, height: 16, background: 'var(--accent)', cursor: 'nwse-resize', borderTopLeftRadius: 4 }} title="drag to resize" />
          </div>
        );
      })}
    </div>
  );
}
