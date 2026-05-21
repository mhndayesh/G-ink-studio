import { useEffect, useState } from 'react';
import type { StageProps } from '../app/Shell';
import type { Panel } from '../lib/types';
import { api } from '../lib/api';
import { useToast } from '../App';
import { AiButton, JobProgress } from '../components/bits';
import { PageCanvas } from '../components/PageCanvas';

export function RenderStage({ view, apply, sel, setSel, reload }: StageProps) {
  const toast = useToast();
  const p = view.project;
  const pages = [...p.pages].sort((a, b) => a.number - b.number);
  const page = pages.find(pg => pg.id === sel.pageId) || pages[0] || null;
  useEffect(() => { if (page && page.id !== sel.pageId) setSel({ pageId: page.id }); }, [page?.id]);
  const panels = page ? p.panels.filter(x => x.pageId === page.id).sort((a, b) => a.number - b.number) : [];
  const panel = panels.find(x => x.id === sel.panelId) || null;
  const [jobId, setJobId] = useState<string | null>(null);

  const rendered = (pn: Panel) => pn.render?.status === 'done' && pn.render.assetId && !pn._renderStale;
  const total = p.panels.length, done = p.panels.filter(rendered).length;

  if (!page) return <div className="card"><h2 className="sec">Render</h2><p className="muted">No pages.</p></div>;

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="sec">Render <span className="muted tiny">{done}/{total} panels done</span></h2>
          <div className="row">
            <AiButton label="Render this page" className="btn ai" onRun={async () => { const v: any = await api.renderPage(p.id, page.id); apply(v); setJobId(v.jobId); }} />
            <AiButton label="Render everything remaining" onRun={async () => { const v: any = await api.renderAll(p.id); apply(v); setJobId(v.jobId); }} />
            <button className="btn sm" onClick={async () => { const v: any = await api.renderAll(p.id, true); apply(v); setJobId(v.jobId); }} title="Re-render every panel from scratch">re-render all</button>
          </div>
        </div>
        <p className="muted tiny" style={{ marginTop: 0 }}>{view.image.configured ? <>Using <b>{view.image.label}</b>.</> : <>No image backend configured — using <b>placeholder</b> renders (tidy cards showing the prompt). Set <code>IMAGE_SERVER_TYPE=http</code> + <code>IMAGE_SERVER_URL</code> for real art. The whole pipeline (incl. export) still works with placeholders.</>} Every panel needs a current, non-stale render to continue.</p>
        <JobProgress jobId={jobId} onDone={() => { setJobId(null); reload(); }} />
        <div className="pagelist">{pages.map(pg => { const r = p.panels.filter(x => x.pageId === pg.id); const d = r.filter(rendered).length; return <button key={pg.id} className={`pt ${pg.id === page.id ? 'sel' : ''}`} onClick={() => setSel({ pageId: pg.id, panelId: null })}>Page {pg.number}<span className={`dot ${d === r.length ? 'dot-ok' : d ? 'dot-warn' : 'dot-none'}`} /></button>; })}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <b>Page {page.number}</b>
          <PageCanvas page={page} panels={p.panels} selPanelId={panel?.id || null} onSelect={id => setSel({ panelId: id })} showRenders />
          <div className="col" style={{ marginTop: 10 }}>
            {panels.map(pn => (
              <div key={pn.id} className={`panelchip ${pn.id === panel?.id ? 'sel' : ''}`} onClick={() => setSel({ panelId: pn.id })}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="pn">Panel {pn.number} {rendered(pn) ? <span className="pill ok">rendered</span> : pn.render?.status === 'error' ? <span className="pill bad">failed</span> : pn._renderStale ? <span className="pill bad">stale</span> : <span className="pill warn">not yet</span>}</span>
                  <button className="btn ai sm" onClick={ev => { ev.stopPropagation(); api.renderPanel(p.id, pn.id).then(apply).catch(e => toast(e.message, 'bad')); }}>render</button>
                </div>
                {pn.render?.error && <div className="tiny" style={{ color: 'var(--bad)' }}>{pn.render.error}</div>}
              </div>
            ))}
          </div>
        </div>
        <div>{panel ? <RenderInspector key={panel.id} panel={panel} pid={p.id} apply={apply} /> : <div className="card"><p className="muted">Select a panel to see its render &amp; history.</p></div>}</div>
      </div>
    </div>
  );
}

function RenderInspector({ panel, pid, apply }: { panel: Panel; pid: string; apply: (v: any) => void }) {
  const toast = useToast();
  const [history, setHistory] = useState<any[]>([]);
  const [seed, setSeed] = useState<string>('');
  const loadHist = () => api.renderHistory(pid, panel.id).then(r => setHistory(r.renders)).catch(() => {});
  useEffect(() => { loadHist(); }, [panel.id, panel.render?.renderId]);
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}><h3 className="sub" style={{ margin: 0 }}>Panel {panel.number}</h3><span className="tiny muted">{panel.render?.model || ''} {panel.render?.seed != null ? `· seed ${panel.render.seed}` : ''} {panel.render?.backend ? `· ${panel.render.backend}` : ''}</span></div>
      {panel.render?.imageUrl ? <img className="thumb" style={{ aspectRatio: 'auto', maxHeight: 360 }} src={panel.render.imageUrl} /> : <div className="thumb placeholder" style={{ height: 240 }}>not rendered</div>}
      <div className="tiny muted mono" style={{ background: '#f7f6f3', padding: 8, borderRadius: 6, marginTop: 8 }}>{panel.imagePrompt || '(no prompt — go back to Pages and compile it)'}</div>
      <div className="row" style={{ marginTop: 8 }}>
        <input className="mono" style={{ width: 110, border: '1px solid var(--line)', borderRadius: 6, padding: '5px 7px' }} placeholder="seed (blank=rand)" value={seed} onChange={e => setSeed(e.target.value)} />
        <button className="btn ai sm" onClick={() => api.renderPanel(pid, panel.id, { seed: seed ? Number(seed) : null }).then(apply).catch(e => toast(e.message, 'bad'))}>render{seed ? ` w/ seed ${seed}` : ''}</button>
        <label className="row tiny" style={{ gap: 4 }}>mode
          <select value={panel.renderMode} onChange={e => api.patchPanel(pid, panel.id, { renderMode: e.target.value }).then(apply)}>
            <option value="auto">auto</option>
            <option value="t2i">text→image</option>
            <option value="i2i">image→image (1 ref)</option>
            <option value="i2i-2refs">image→image (2 refs · stitch)</option>
          </select>
        </label>
        {panel._renderMode && panel._renderMode !== panel.renderMode && <span className="tiny muted" title="the mode the renderer will actually use, given which characters/locations currently have reference images">→ {panel._renderMode}</span>}
      </div>
      {panel._promptStale && <div className="tiny" style={{ color: 'var(--bad)', marginTop: 4 }}>Prompt is stale — recompile it in the Pages stage so it matches the current render mode.</div>}
      <h3 className="sub">History ({history.length})</h3>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        {history.map(h => (
          <div key={h.id} style={{ width: 90 }}>
            {h.imageUrl ? <img className="thumb" src={h.imageUrl} style={{ outline: h.isCurrent ? '2px solid var(--accent)' : undefined }} /> : <div className="thumb placeholder">{h.status === 'error' ? 'error' : '—'}</div>}
            <div className="tiny muted">{h.isCurrent ? <b>current</b> : <button className="btn ghost sm" disabled={!h.imageUrl} onClick={() => api.rollbackRender(pid, panel.id, h.id).then(v => { apply(v); loadHist(); })}>make current</button>}</div>
            {h.error && <div className="tiny" style={{ color: 'var(--bad)' }}>{h.error.slice(0, 60)}</div>}
          </div>
        ))}
        {!history.length && <span className="muted tiny">No renders yet.</span>}
      </div>
    </div>
  );
}
