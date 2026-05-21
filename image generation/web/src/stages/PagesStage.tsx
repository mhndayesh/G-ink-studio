import { useEffect, useState } from 'react';
import type { StageProps } from '../app/Shell';
import type { Panel, Page } from '../lib/types';
import { CAMERA_SHOTS } from '../lib/types';
import { api } from '../lib/api';
import { useToast } from '../App';
import { AiButton, EditField, SourcePill } from '../components/bits';
import { PageCanvas } from '../components/PageCanvas';
import { LayoutEditor } from '../components/LayoutEditor';

const TEMPLATES = [['auto', 'Auto'], ['single', 'Single splash'], ['rows', 'Stacked rows'], ['grid-2', '2-up grid'], ['custom', 'Custom (drag)']];

export function PagesStage({ view, apply, sel, setSel }: StageProps) {
  const toast = useToast();
  const p = view.project;
  const [layoutEdit, setLayoutEdit] = useState(false);
  const pages = [...p.pages].sort((a, b) => a.number - b.number);
  const page = pages.find(pg => pg.id === sel.pageId) || pages[0] || null;
  useEffect(() => { if (page && page.id !== sel.pageId) setSel({ pageId: page.id }); }, [page?.id]);
  const panels = page ? p.panels.filter(x => x.pageId === page.id).sort((a, b) => a.number - b.number) : [];
  const orderedPanels = page ? page.layout.panels.map(c => p.panels.find(x => x.id === c.panelId)!).filter(Boolean) : [];
  const panel = panels.find(x => x.id === sel.panelId) || null;
  const ready = (pn: Panel) => !!(pn.cameraShot && pn.imagePrompt);
  const pageReady = (pg: Page) => p.panels.filter(x => x.pageId === pg.id).every(ready);

  if (!page) return <div className="card"><h2 className="sec">Pages</h2><p className="muted">No pages — go back to Story and import a manga.</p></div>;

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="sec">Pages</h2>
          <div className="row">
            <AiButton label={`AI fill & compile · this page`} className="btn ai" onRun={async () => { const v = await api.aiFillPages(p.id, page.id); apply(v); toast(`Compiled this page${v.llmUsed ? ` (model upgraded ${v.llmUsed})` : ''}.`); }} />
            <AiButton label="AI fill & compile · ALL pages" onRun={async () => { const v = await api.aiFillPages(p.id); apply(v); toast(`Compiled ${v.total} panel prompt(s)${v.llmUsed ? ` (model upgraded ${v.llmUsed})` : ' from your rules'}.`); }} />
          </div>
        </div>
        <p className="muted tiny" style={{ marginTop: 0 }}>Lay out the panels and compile each one's <b>direct image prompt</b> = the global style + the panel's visual, action, characters, camera shot, location and mood. Every panel needs a camera shot and a compiled prompt to continue.</p>
        <div className="pagelist">
          {pages.map(pg => <button key={pg.id} className={`pt ${pg.id === page.id ? 'sel' : ''}`} onClick={() => setSel({ pageId: pg.id, panelId: null })}>Page {pg.number}<span className={`dot ${pageReady(pg) ? 'dot-ok' : 'dot-warn'}`} /></button>)}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <b>Page {page.number} — {page.sceneLabel}</b>
              <div className="row tiny">
                <button className={`btn sm ${layoutEdit ? 'primary' : ''}`} onClick={() => setLayoutEdit(v => !v)} title="Drag panels to move; drag the corner to resize">{layoutEdit ? '✓ editing layout' : 'edit layout'}</button>
                <label className="row tiny" style={{ gap: 4 }}>layout
                  <select value={TEMPLATES.some(([v]) => v === page.layout.template) ? page.layout.template : 'custom'} onChange={e => { setLayoutEdit(e.target.value === 'custom'); if (e.target.value !== 'custom') api.patchPage(p.id, page.id, { layoutTemplate: e.target.value }).then(apply); }}>{TEMPLATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                </label>
                <label className="row tiny" style={{ gap: 4 }}>reading
                  <select value={page.layout.readingDir} onChange={e => api.patchPage(p.id, page.id, { readingDir: e.target.value }).then(apply)}><option value="rtl">right-to-left (manga)</option><option value="ltr">left-to-right</option></select>
                </label>
              </div>
            </div>
            {layoutEdit
              ? <><LayoutEditor page={page} panels={p.panels} selPanelId={panel?.id || null} onSelect={id => setSel({ panelId: id })} onSave={cells => api.putLayout(p.id, page.id, cells).then(apply)} /><div className="tiny muted" style={{ marginTop: 4 }}>Drag a panel to move it; drag the purple corner to resize. Switching the layout dropdown to a template undoes the custom layout.</div></>
              : <PageCanvas page={page} panels={p.panels} selPanelId={panel?.id || null} onSelect={id => setSel({ panelId: id })} showRenders />}
            <EditField label="Scene purpose" value={page.scenePurpose || ''} onSave={v => api.patchPage(p.id, page.id, { scenePurpose: v }).then(apply)} textarea rows={2} />
          </div>
          <div className="card">
            <h3 className="sub">Panels on this page</h3>
            <div className="col">
              {orderedPanels.map((pn, i) => (
                <div key={pn.id} className={`panelchip ${pn.id === panel?.id ? 'sel' : ''}`} onClick={() => setSel({ panelId: pn.id })}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="pn">Panel {pn.number} {ready(pn) ? <span className="pill ok">ready</span> : <span className="pill warn">{!pn.cameraShot ? 'no shot' : 'not compiled'}</span>} {pn._promptStale && <span className="pill bad">stale</span>} <SourcePill source={pn._promptSource} /></span>
                    <span className="row tiny">
                      <button className="btn sm" disabled={i === 0} onClick={ev => { ev.stopPropagation(); api.movePanel(p.id, page.id, pn.id, i - 1).then(apply); }}>↑</button>
                      <button className="btn sm" disabled={i === orderedPanels.length - 1} onClick={ev => { ev.stopPropagation(); api.movePanel(p.id, page.id, pn.id, i + 1).then(apply); }}>↓</button>
                    </span>
                  </div>
                  <div className="pv">{pn.visual || <i className="muted">no visual</i>}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          {panel ? <PanelEditor key={panel.id} panel={panel} view={view} apply={apply} /> : <div className="card"><p className="muted">Select a panel on the left (click a cell in the page, or a panel chip).</p></div>}
        </div>
      </div>
    </div>
  );
}

function PanelEditor({ panel, view, apply }: { panel: Panel; view: any; apply: (v: any) => void }) {
  const p = view.project;
  const patch = (body: any) => api.patchPanel(p.id, panel.id, body).then(apply);
  const SHOTS: string[] = ['', ...((view.cameraShots && view.cameraShots.length ? view.cameraShots : CAMERA_SHOTS) as string[])];
  const resolvedMode = panel._renderMode || (panel.renderMode !== 'auto' ? panel.renderMode : null);
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h3 className="sub" style={{ margin: 0 }}>Panel {panel.number} {panel._promptStale && <span className="pill bad">prompt stale — recompile</span>}</h3>
        <AiButton label="Compile prompt" className="btn ai sm" onRun={() => api.aiCompilePanel(p.id, panel.id).then(apply)} title="Recompile this panel's image prompt from its fields + the global style" />
      </div>
      <EditField label="Visual (what we see)" value={panel.visual} onSave={v => patch({ visual: v })} textarea rows={3} />
      <EditField label="Action (what's happening)" value={panel.action} onSave={v => patch({ action: v })} textarea rows={2} />
      <div className="grid2">
        <label className="field"><span>Camera shot</span><select value={panel.cameraShot || ''} onChange={e => patch({ cameraShot: e.target.value })}>{SHOTS.map(s => <option key={s} value={s}>{s || '— pick a shot —'}</option>)}</select></label>
        <EditField label="Mood" value={panel.mood} onSave={v => patch({ mood: v })} />
      </div>
      <label className="field"><span>Location</span>
        <select value={panel.locationId || ''} onChange={e => patch({ locationId: e.target.value || null })}><option value="">— none —</option>{p.locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      </label>
      <label className="field"><span>Render mode</span>
        <select value={panel.renderMode || 'auto'} onChange={e => patch({ renderMode: e.target.value })}>
          <option value="auto">auto (i2i if anyone in this panel has a reference)</option>
          <option value="t2i">t2i — text-to-image, ignore refs</option>
          <option value="i2i">i2i — 1 reference image</option>
          <option value="i2i-2refs">i2i — 2 reference images (ImageStitch)</option>
        </select>
      </label>
      <label className="field"><span>Characters in this panel</span>
        <div className="row tiny" style={{ gap: 6 }}>
          {p.characters.map((c: any) => { const on = panel.characters.includes(c.id); return <button key={c.id} className={`btn sm ${on ? 'primary' : ''}`} onClick={() => patch({ characters: on ? panel.characters.filter(x => x !== c.id) : [...panel.characters, c.id] })}>{on ? '✓ ' : ''}{c.name}</button>; })}
          {!p.characters.length && <span className="muted">no cast</span>}
        </div>
      </label>
      {(panel.dialogue || panel.narration || panel.sfxText) && <div className="tiny muted" style={{ background: '#f7f6f3', padding: 8, borderRadius: 6 }}>{panel.narration && <div><b>Narration:</b> {panel.narration}</div>}{panel.dialogue && <div style={{ whiteSpace: 'pre-wrap' }}><b>Dialogue:</b>{'\n'}{panel.dialogue}</div>}{panel.sfxText && <div><b>SFX:</b> {panel.sfxText}</div>}</div>}
      <hr className="soft" />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b className="tiny">Compiled image prompt <SourcePill source={panel._promptSource} /> {resolvedMode && <span className="pill" title={resolvedMode === 't2i' ? 'text-to-image: comma-separated tags' : 'image-to-image: a natural-language edit instruction for the reference image'}>{resolvedMode === 't2i' ? 'tag list (t2i)' : `instruction (${resolvedMode})`}</span>}</b>
        <label className="row tiny" style={{ gap: 4 }}><input type="checkbox" checked={!!panel.imagePromptLocked} onChange={e => patch({ imagePromptLocked: e.target.checked })} /> lock</label>
      </div>
      <EditField value={panel.imagePrompt} onSave={v => patch({ imagePrompt: v })} textarea rows={4} mono />
      <EditField label="Extra negative tags for this panel" value={panel.negativeAddon || ''} onSave={v => patch({ negativeAddon: v })} mono />
    </div>
  );
}
