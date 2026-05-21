import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../App';

export function Hub({ onPick }: { onPick: (id: string) => void }) {
  const toast = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [story, setStory] = useState('');
  const [visuals, setVisuals] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [title, setTitle] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = () => api.listProjects().then(r => setProjects(r.projects)).catch(() => {});
  useEffect(() => { refresh(); }, []);

  async function readFiles(files: FileList | File[]) {
    let s = story, v = visuals;
    for (const f of Array.from(files)) {
      const text = await f.text();
      const name = f.name.toLowerCase();
      if (/story/.test(name)) s = text;
      else if (/visual/.test(name)) v = text;
      else if (/scene/.test(name)) { /* scenes file: dialogue is already in visuals; ignored */ }
      else if (!s) s = text; else if (!v) v = text;
    }
    setStory(s); setVisuals(v);
    if (s || v) { try { const pv = await api.previewIngest(s, v); setPreview(pv); if (!title) setTitle(pv.title || ''); } catch (e: any) { toast(e.message, 'bad'); } }
  }

  async function doImport() {
    setBusy(true);
    try { const created: any = await api.ingest(story, visuals, title || undefined); onPick(created.id); }
    catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function newBlank() {
    setBusy(true);
    try { const created: any = await api.createProject(title || 'Untitled Manga'); onPick(created.id); }
    catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  }
  async function del(id: string) { if (!confirm('Delete this project? This cannot be undone.')) return; await api.deleteProject(id); refresh(); }

  return (
    <div className="hub">
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>G-Ink Studio <span className="pill ai">v2</span></h1>
      <p className="muted" style={{ marginTop: 0 }}>An AI manga maker — five steps, in order: <b>Story → Cast &amp; World → Pages → Render → Letter &amp; Export</b>. Every step has one ✨ button that fills it from your story.</p>

      <div className="card">
        <h2 className="sec">Start a new manga</h2>
        <div
          className={`dropzone ${over ? 'over' : ''}`}
          onDragOver={e => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={e => { e.preventDefault(); setOver(false); readFiles(e.dataTransfer.files); }}
          onClick={() => fileInput.current?.click()}
        >
          <input ref={fileInput} type="file" multiple accept=".md,.txt" hidden onChange={e => e.target.files && readFiles(e.target.files)} />
          {preview ? (
            <div style={{ textAlign: 'left' }}>
              <b>{preview.title}</b> <span className="muted">{preview.genre}</span>
              <div className="tiny muted" style={{ margin: '6px 0' }}>{preview.synopsis?.slice(0, 220)}{preview.synopsis?.length > 220 ? '…' : ''}</div>
              <div className="row tiny">
                <span className="pill">{preview.counts.characters} characters</span>
                <span className="pill">{preview.counts.locations} locations</span>
                <span className="pill">{preview.counts.chapters} chapters</span>
                <span className="pill">{preview.counts.pages} pages</span>
                <span className="pill">{preview.counts.panels} panels</span>
              </div>
            </div>
          ) : (
            <><b>Drop your story files here</b><div className="tiny">…or click to choose. Expecting the <code>*-story.md</code> and <code>*-visuals.md</code> bundle (a <code>*-scenes.md</code> file is optional — its dialogue is already in the visuals file).</div></>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <label className="field" style={{ flex: 1 }}><span>Project title</span><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Untitled Manga" /></label>
          <button className="btn primary big" disabled={busy || (!story && !visuals)} onClick={doImport}>{busy ? <span className="spinner" /> : 'Import & start →'}</button>
          <button className="btn big" disabled={busy} onClick={newBlank}>Start blank</button>
        </div>
      </div>

      <div className="card">
        <h2 className="sec">Your projects</h2>
        {projects.length === 0 && <p className="muted">No projects yet.</p>}
        {projects.map(p => (
          <div className="proj" key={p.id}>
            <div><b>{p.title}</b><div className="tiny muted">updated {new Date(p.updated_at).toLocaleString()}</div></div>
            <div className="row"><button className="btn primary sm" onClick={() => onPick(p.id)}>Open</button><button className="btn danger sm" onClick={() => del(p.id)}>Delete</button></div>
          </div>
        ))}
      </div>
    </div>
  );
}
