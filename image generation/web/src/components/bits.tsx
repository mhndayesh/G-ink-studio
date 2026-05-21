import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

/** A primary "✨ AI fill" button that shows a spinner while its async handler runs. */
export function AiButton({ label, onRun, className = 'btn ai', disabled, title }: { label: string; onRun: () => Promise<any>; className?: string; disabled?: boolean; title?: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button className={className} disabled={busy || disabled} title={title}
      onClick={async () => { setBusy(true); try { await onRun(); } finally { setBusy(false); } }}>
      {busy ? <><span className="spinner" /> Working…</> : <>✨ {label}</>}
    </button>
  );
}

/** A debounced text field that PATCHes on blur / Enter. */
export function EditField({ label, value, onSave, textarea, mono, rows, placeholder, hint }: { label?: string; value: string; onSave: (v: string) => Promise<any> | void; textarea?: boolean; mono?: boolean; rows?: number; placeholder?: string; hint?: string }) {
  const [v, setV] = useState(value ?? '');
  const dirty = useRef(false);
  useEffect(() => { if (!dirty.current) setV(value ?? ''); }, [value]);
  const commit = () => { if (v !== (value ?? '')) { dirty.current = false; onSave(v); } else dirty.current = false; };
  const common = { value: v, placeholder, onChange: (e: any) => { dirty.current = true; setV(e.target.value); }, onBlur: commit, className: mono ? 'mono' : undefined };
  return (
    <label className="field">
      {label && <span>{label}{hint && <span className="muted" style={{ fontWeight: 400 }}> — {hint}</span>}</span>}
      {textarea ? <textarea rows={rows || 3} {...common} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) commit(); }} /> : <input {...common} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />}
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <label className="row tiny" style={{ gap: 6, cursor: 'pointer', fontWeight: 600 }}><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />{label}</label>;
}

/** Polls a job until it finishes; renders a slim progress line. */
export function JobProgress({ jobId, onDone }: { jobId: string | null; onDone?: () => void }) {
  const [job, setJob] = useState<any>(null);
  useEffect(() => {
    if (!jobId) { setJob(null); return; }
    let live = true;
    const tick = async () => { try { const j = await api.job(jobId); if (!live) return; setJob(j); if (j.status === 'running') setTimeout(tick, 700); else onDone?.(); } catch { /* ignore */ } };
    tick();
    return () => { live = false; };
  }, [jobId]);
  if (!job) return null;
  const pct = Math.round((job.progress || 0) * 100);
  return (
    <div className="tiny" style={{ margin: '8px 0' }}>
      <div className="row" style={{ gap: 8 }}>
        {job.status === 'running' ? <span className="spinner" /> : <span>{job.error ? '⚠️' : '✓'}</span>}
        <span>{job.message || job.kind} {job.total ? `(${pct}%)` : ''}</span>
      </div>
      <div style={{ height: 4, background: '#eee', borderRadius: 4, marginTop: 4, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: job.error ? '#c0392b' : '#6c4ad6', transition: 'width .3s' }} /></div>
      {job.error && <div className="muted" style={{ marginTop: 4 }}>{job.error}</div>}
    </div>
  );
}

export function SourcePill({ source }: { source?: string }) {
  if (source === 'llm') return <span className="pill ai" title="written by the AI model">AI</span>;
  if (source === 'compiled') return <span className="pill compiled" title="built from your rules + the story, no LLM">compiled</span>;
  return null;
}
