import { useState } from 'react';
import type { StageProps } from '../app/Shell';
import type { Character, Location } from '../lib/types';
import { api } from '../lib/api';
import { useToast } from '../App';
import { AiButton, EditField, SourcePill } from '../components/bits';

function fileToB64(f: File): Promise<{ b64: string; mime: string }> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res({ b64: String(r.result).split(',')[1] || '', mime: f.type || 'image/png' }); r.onerror = rej; r.readAsDataURL(f); });
}

export function CastWorldStage({ view, apply }: StageProps) {
  const toast = useToast();
  const p = view.project;
  const usedLoc = new Set(p.panels.map(x => x.locationId).filter(Boolean) as string[]);

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="sec">Cast &amp; World</h2>
          <AiButton label="AI fill all looks" onRun={async () => { const v = await api.aiFillCast(p.id); apply(v); toast(`Filled ${v.total} look(s)${v.llmUsed ? ` (${v.llmUsed} via the model)` : ' (compiled from your rules)'}.`); }}
            title="For every character & location used in a panel that still has no image prompt, build a direct comma-separated prompt from its sheet + the global style." />
        </div>
        <p className="muted tiny" style={{ marginTop: 0 }}>Lock in how everything looks. The <b>global style</b> below is prepended to <i>every</i> image prompt in the project — change it once, it applies everywhere. Every character (and every location used in a panel) needs a non-empty image prompt to continue.</p>
      </div>

      <div className="card">
        <h3 className="sub">Global style — the system layer of every prompt</h3>
        <div className="grid2">
          <EditField label="Always-include style tags" value={p.systemRule.positive} onSave={v => api.patchSystemRule(p.id, { positive: v }).then(apply)} textarea rows={3} mono hint="e.g. manga style, black and white, screentone shading" />
          <EditField label="Always-exclude (negative) tags" value={p.systemRule.negative} onSave={v => api.patchSystemRule(p.id, { negative: v }).then(apply)} textarea rows={3} mono hint="color, photo, extra fingers, …" />
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <label className="field"><span>AI provider</span>
            <select value={p.aiSettings.provider} onChange={e => api.patchAiSettings(p.id, { provider: e.target.value }).then(apply)}>
              <option value="auto">Auto (cloud if a key is set, else local)</option>
              <option value="anthropic">Claude (cloud)</option>
              <option value="openai">OpenAI (cloud)</option>
              <option value="lmstudio">LM Studio (local)</option>
              <option value="off">Off — deterministic only</option>
            </select>
          </label>
          <span className="tiny muted">Currently using: <b>{view.llm.label}</b>. Everything works with the model off; it just won't sound as natural.</span>
        </div>
      </div>

      <h3 className="sub">Characters — {p.characters.length}</h3>
      <div className="grid2">{p.characters.map(c => <EntityCard key={c.id} kind="character" e={c} pid={p.id} apply={apply} doc={view} />)}</div>

      <h3 className="sub">Locations — {p.locations.length} <span className="muted">({usedLoc.size} used in panels)</span></h3>
      <div className="grid2">{p.locations.map(l => <EntityCard key={l.id} kind="location" e={l} pid={p.id} apply={apply} doc={view} used={usedLoc.has(l.id)} />)}</div>
    </div>
  );
}

function EntityCard({ kind, e, pid, apply, doc, used }: { kind: 'character' | 'location'; e: Character | Location; pid: string; apply: (v: any) => void; doc: any; used?: boolean }) {
  const toast = useToast();
  const [showSheet, setShowSheet] = useState(false);
  const isChar = kind === 'character';
  const sheetText = isChar ? (e as Character).sheet || '' : (e as Location).description || '';
  const patch = (body: any) => (isChar ? api.patchCharacter(pid, e.id, body) : api.patchLocation(pid, e.id, body)).then(apply);
  const fillOne = async () => { const v = isChar ? await api.aiFillCharacter(pid, e.id) : await api.aiFillLocation(pid, e.id); apply(v); };
  const upload = async (files: FileList | null) => { if (!files?.length) return; const { b64, mime } = await fileToB64(files[0]); const v = isChar ? await api.uploadCharRef(pid, e.id, b64, mime, files[0].name) : await api.uploadLocRef(pid, e.id, b64, mime, files[0].name); apply(v); toast('Reference uploaded — renders for this panel will use it (image-to-image).'); };
  const generateRef = async () => { const v = isChar ? await api.generateCharRef(pid, e.id) : await api.generateLocRef(pid, e.id); apply(v); toast(`Reference image generated for ${e.name}.`); };

  return (
    <div className="card" style={{ borderColor: e.imagePrompt ? 'var(--line)' : '#e7c3bd' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><b>{e.name}</b> <span className="muted tiny">{isChar ? (e as Character).role : (e as Location).type}</span> {used === false && <span className="pill" title="not used in any panel — its prompt is optional">unused</span>}</div>
        <div className="row">
          <SourcePill source={(e as any)._promptSource} />
          {e.imagePromptLocked && <span className="pill locked">locked</span>}
          <AiButton label="" className="btn ai sm" onRun={fillOne} title="Rewrite this one's image prompt from its sheet + global style" />
        </div>
      </div>

      <EditField label="Image prompt (direct tags)" value={e.imagePrompt || ''} onSave={v => patch({ imagePrompt: v })} textarea rows={3} mono hint="comma-separated; the global style is added automatically" />
      <div className="row tiny" style={{ justifyContent: 'space-between' }}>
        <label className="row tiny" style={{ gap: 4 }}><input type="checkbox" checked={!!e.imagePromptLocked} onChange={ev => patch({ imagePromptLocked: ev.target.checked })} /> lock (AI won't overwrite)</label>
        <button className="btn ghost sm" onClick={() => setShowSheet(s => !s)}>{showSheet ? 'hide' : 'show'} {isChar ? 'sheet' : 'description'}</button>
      </div>
      {showSheet && <EditField value={sheetText} onSave={v => patch(isChar ? { sheet: v } : { description: v })} textarea rows={6} mono />}

      <div style={{ marginTop: 8 }}>
        <div className="tiny muted">Reference images ({(e.refs || []).length}) — optional; used as image-to-image seeds.</div>
        <div className="row" style={{ marginTop: 4 }}>
          {(e.refs || []).map(aid => <div key={aid} style={{ position: 'relative' }}><img src={api.assetUrl(aid)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line)' }} /><button className="btn sm danger" style={{ position: 'absolute', top: -6, right: -6, padding: '0 5px', lineHeight: '16px' }} onClick={async () => apply(await api.removeRef(pid, aid))}>×</button></div>)}
          <AiButton label="Generate" className="btn ai sm" onRun={generateRef} disabled={!e.imagePrompt} title={e.imagePrompt ? `Render a reference image for ${e.name} via your image server` : 'Fill the image prompt first'} />
          <label className="btn sm" style={{ display: 'inline-flex', alignItems: 'center' }}>+ upload<input type="file" accept="image/*" hidden onChange={ev => upload(ev.target.files)} /></label>
        </div>
      </div>
    </div>
  );
}
