import type { Page, Panel, LetteringObj } from '../lib/types';
import { api } from '../lib/api';

export function PageCanvas({ page, panels, selPanelId, onSelect, showRenders, showLettering, selLetteringId, onSelectLettering }: {
  page: Page; panels: Panel[]; selPanelId?: string | null; onSelect?: (panelId: string) => void;
  showRenders?: boolean; showLettering?: boolean; selLetteringId?: string | null; onSelectLettering?: (id: string) => void;
}) {
  const byId = (id: string) => panels.find(p => p.id === id);
  return (
    <div className="pagecanvas">
      {(page.layout.panels || []).map(cell => {
        const pn = byId(cell.panelId);
        const img = showRenders && pn?.render?.imageUrl ? pn.render.imageUrl : null;
        return (
          <div key={cell.panelId} className={`cell ${selPanelId === cell.panelId ? 'sel' : ''}`} style={{ left: `${cell.x}%`, top: `${cell.y}%`, width: `${cell.w}%`, height: `${cell.h}%` }}
            onClick={() => onSelect?.(cell.panelId)}>
            <span className="cnum">{pn?.number ?? '?'}</span>
            {img ? <img src={img} alt="" /> : <div className="ph">{pn?.visual?.slice(0, 80) || 'panel'}{pn?.render?.status === 'error' ? ' ⚠️ render failed' : showRenders ? ' — not rendered' : ''}</div>}
          </div>
        );
      })}
      {showLettering && (page.lettering || []).map((l: LetteringObj) => (
        <div key={l.id} className={`let ${l.type} ${selLetteringId === l.id ? 'sel' : ''}`} style={{ left: `${l.x}%`, top: `${l.y}%`, width: `${l.w}%`, height: `${l.h}%`, transform: l.rotation ? `rotate(${l.rotation}deg)` : undefined, fontSize: `${(l.fontSize || 3) * 0.32}vmin` }}
          onClick={e => { e.stopPropagation(); onSelectLettering?.(l.id); }} title={l.speaker ? `${l.speaker}: ${l.text}` : l.text}>
          {l.text}
        </div>
      ))}
    </div>
  );
}
