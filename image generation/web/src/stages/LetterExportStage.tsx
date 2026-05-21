import { useEffect, useState } from 'react';
import type { StageProps } from '../app/Shell';
import type { LetteringObj } from '../lib/types';
import { api } from '../lib/api';
import { useToast } from '../App';
import { AiButton, EditField } from '../components/bits';
import { PageCanvas } from '../components/PageCanvas';

export function LetterExportStage({ view, apply, sel, setSel }: StageProps) {
  const toast = useToast();
  const p = view.project;
  const pages = [...p.pages].sort((a, b) => a.number - b.number);
  const page = pages.find(pg => pg.id === sel.pageId) || pages[0] || null;
  useEffect(() => { if (page && page.id !== sel.pageId) setSel({ pageId: page.id }); }, [page?.id]);
  const [selLet, setSelLet] = useState<string | null>(null);
  const [exported, setExported] = useState<{ pageId: string; number: number; svg: string }[] | null>(null);

  if (!page) return <div className="card"><h2 className="sec">Letter &amp; Export</h2><p className="muted">No pages.</p></div>;
  const lettering = page.lettering || [];
  const sl = lettering.find(l => l.id === selLet) || null;
  const patchLet = (body: any) => api.patchLettering(p.id, page.id, sl!.id, body).then(apply);

  const qcBad = p.panels.filter(x => x.qc?.status === 'needs_fix').length;
  const allApproved = pages.every(pg => pg.approved && (pg.lettering || []).length);

  async function doExport() { const r = await api.exportPages(p.id); setExported(r.pages); }

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="sec">Letter &amp; Export</h2>
          <div className="row">
            <AiButton label="Auto-letter this page" className="btn ai" onRun={async () => { apply(await api.letterPage(p.id, page.id)); toast('Lettering placed — nudge anything that overlaps.'); }} />
            <AiButton label="Auto-letter ALL pages" onRun={async () => { apply(await api.letterAll(p.id)); toast('Lettering placed on every page.'); }} />
            <button className="btn sm" onClick={async () => { apply(await api.runQC(p.id)); toast('QC run.'); }}>Run QC</button>
          </div>
        </div>
        <p className="muted tiny" style={{ marginTop: 0 }}>Place speech bubbles, narration boxes and SFX over the art, then approve each page. When every page has lettering and is approved you can export the book (one SVG per page, art + lettering embedded).</p>
        {qcBad > 0 && <div className="gate" style={{ marginBottom: 8 }}>{qcBad} panel(s) failed QC. <button className="btn ghost sm" onClick={async () => { apply(await api.runQC(p.id)); }}>re-run</button></div>}
        <div className="pagelist">{pages.map(pg => <button key={pg.id} className={`pt ${pg.id === page.id ? 'sel' : ''}`} onClick={() => { setSel({ pageId: pg.id }); setSelLet(null); }}>Page {pg.number}<span className={`dot ${pg.approved && (pg.lettering || []).length ? 'dot-ok' : (pg.lettering || []).length ? 'dot-warn' : 'dot-none'}`} /></button>)}</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <b>Page {page.number} — {page.sceneLabel}</b>
            <label className="row tiny" style={{ gap: 5 }}><input type="checkbox" checked={!!page.approved} onChange={e => api.approvePage(p.id, page.id, e.target.checked).then(apply)} /> approved</label>
          </div>
          <PageCanvas page={page} panels={p.panels} showRenders showLettering selLetteringId={selLet} onSelectLettering={setSelLet} onSelect={() => setSelLet(null)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={() => api.addLettering(p.id, page.id, { type: 'speech', text: 'New line' }).then(apply)}>+ speech</button>
            <button className="btn sm" onClick={() => api.addLettering(p.id, page.id, { type: 'narration', text: 'Narration' }).then(apply)}>+ narration</button>
            <button className="btn sm" onClick={() => api.addLettering(p.id, page.id, { type: 'sfx', text: 'BOOM' }).then(apply)}>+ sfx</button>
            <div className="grow" /><a className="btn sm" href={api.pageSvgUrl(p.id, page.id)} target="_blank" rel="noreferrer">download this page .svg</a>
          </div>
        </div>

        <div className="card">
          {sl ? (
            <div>
              <div className="row" style={{ justifyContent: 'space-between' }}><h3 className="sub" style={{ margin: 0 }}>{sl.type} bubble</h3><button className="btn danger sm" onClick={() => { api.removeLettering(p.id, page.id, sl.id).then(apply); setSelLet(null); }}>delete</button></div>
              <label className="field"><span>Type</span><select value={sl.type} onChange={e => patchLet({ type: e.target.value })}><option value="speech">speech</option><option value="thought">thought</option><option value="narration">narration</option><option value="sfx">sfx</option></select></label>
              <EditField label="Text" value={sl.text} onSave={v => patchLet({ text: v })} textarea rows={2} />
              <div className="grid2">
                <NumField label="x %" v={sl.x} on={v => patchLet({ x: v })} />
                <NumField label="y %" v={sl.y} on={v => patchLet({ y: v })} />
                <NumField label="width %" v={sl.w} on={v => patchLet({ w: v })} />
                <NumField label="height %" v={sl.h} on={v => patchLet({ h: v })} />
                <NumField label="font size" v={sl.fontSize} on={v => patchLet({ fontSize: v })} step={0.2} />
                <NumField label="rotation°" v={sl.rotation} on={v => patchLet({ rotation: v })} min={-45} max={45} />
              </div>
              {sl.speaker && <div className="tiny muted">speaker: {sl.speaker}</div>}
            </div>
          ) : <p className="muted">Click a bubble on the page to edit it, or add one below the page. Bubble positions are in % of the page.</p>}
          <hr className="soft" />
          <h3 className="sub">Lettering on this page ({lettering.length})</h3>
          {lettering.map(l => <div key={l.id} className={`panelchip ${l.id === selLet ? 'sel' : ''}`} onClick={() => setSelLet(l.id)}><span className="pn">{l.type}</span> <span className="pv">{l.speaker ? `${l.speaker}: ` : ''}{l.text}</span></div>)}
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 className="sub" style={{ margin: 0 }}>Export</h3>
          <div className="row"><button className="btn sm" onClick={() => api.approveAll(p.id).then(apply)}>approve all pages</button><button className="btn primary" disabled={!allApproved} onClick={doExport} title={allApproved ? '' : 'Every page must have lettering and be approved'}>Preview pages</button></div>
        </div>
        {!allApproved && <p className="muted tiny">{pages.filter(pg => !(pg.approved && (pg.lettering || []).length)).length} page(s) still need lettering &amp; approval.</p>}
        <div className="row" style={{ marginTop: 8 }}>
          <a className={`btn ${allApproved ? 'primary' : ''}`} href={api.bookCbzUrl(p.id)} aria-disabled={!allApproved} onClick={e => { if (!allApproved) e.preventDefault(); }} title="A ZIP of per-page SVGs + a book.html — opens in browsers; rename to .zip if needed">⬇ Download .cbz (the book)</a>
          <a className="btn" href={api.bookHtmlUrl(p.id)} target="_blank" rel="noreferrer" title="Open the book in a new tab — then ⌘/Ctrl-P → Save as PDF for a vector PDF">📖 Open book as web page (→ print to PDF)</a>
          <a className="btn sm" href={api.bookHtmlUrl(p.id, true)}>⬇ book.html</a>
          <button className="btn sm" disabled={!allApproved} onClick={async () => { const r = await api.exportSave(p.id); toast(`Saved ${r.saved.length} page SVG(s) to project files.`); }}>save SVGs to project files</button>
        </div>
        {exported && (
          <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
            {exported.map(pg => (
              <div key={pg.pageId} style={{ width: 160 }}>
                <div className="thumb" style={{ aspectRatio: '1240/1754', background: '#fff', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: pg.svg.replace('<svg ', '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%" ') }} />
                <a className="btn sm" href={api.pageSvgUrl(p.id, pg.pageId)} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 4 }}>page {pg.number}.svg ↓</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NumField({ label, v, on, step = 1, min, max }: { label: string; v: number; on: (v: number) => void; step?: number; min?: number; max?: number }) {
  const [val, setVal] = useState(String(v ?? 0));
  useEffect(() => { setVal(String(v ?? 0)); }, [v]);
  return <label className="field"><span>{label}</span><input type="number" step={step} min={min} max={max} value={val} onChange={e => setVal(e.target.value)} onBlur={() => { const n = Number(val); if (!Number.isNaN(n) && n !== v) on(n); }} /></label>;
}
