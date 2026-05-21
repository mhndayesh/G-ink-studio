import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, subscribeProject } from './lib/api';
import type { ProjectView } from './lib/types';
import { Hub } from './app/Hub';
import { Shell } from './app/Shell';

// ── tiny toast bus ──────────────────────────────────────────────
type ToastFn = (msg: string, kind?: 'ok' | 'bad') => void;
export const ToastCtx = createContext<ToastFn>(() => {});
export const useToast = () => useContext(ToastCtx);

// ── busy overlay (one global "AI is working" flag) ──────────────
export const BusyCtx = createContext<{ busy: string | null; run: <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined> }>({ busy: null, run: async (_, f) => f() });
export const useBusy = () => useContext(BusyCtx);

const LS_KEY = 'gink.v2.projectId';

export default function App() {
  const [projectId, setProjectId] = useState<string | null>(() => localStorage.getItem(LS_KEY));
  const [view, setView] = useState<ProjectView | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'bad' } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const toastTimer = useRef<any>(null);

  const showToast: ToastFn = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'bad' ? 6000 : 3000);
  }, []);

  const reload = useCallback(async () => {
    if (!projectId) return;
    try { const v = await api.getProject(projectId); setView(v); setLoadErr(null); }
    catch (e: any) { setLoadErr(e.message); if (e.status === 404) { localStorage.removeItem(LS_KEY); setProjectId(null); } }
  }, [projectId]);

  useEffect(() => { if (projectId) { localStorage.setItem(LS_KEY, projectId); reload(); } }, [projectId, reload]);
  useEffect(() => { if (!projectId) return; return subscribeProject(projectId, () => reload()); }, [projectId, reload]);

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(label);
    try { const out = await fn(); return out; }
    catch (e: any) {
      if (e.gate) showToast(`Can't continue yet — ${e.gate.blockers?.length || 0} item(s) need attention.`, 'bad');
      else showToast(e.message || 'Something went wrong', 'bad');
      return undefined;
    } finally { setBusy(null); }
  }, [showToast]);

  // helper passed to children: applies a ProjectView result returned by an API call
  const applyView = useCallback((v: any) => { if (v && v.project) setView(v as ProjectView); }, []);

  function pickProject(id: string) { setView(null); setProjectId(id); }
  function closeProject() { setView(null); setProjectId(null); localStorage.removeItem(LS_KEY); }

  return (
    <ToastCtx.Provider value={showToast}>
      <BusyCtx.Provider value={{ busy, run }}>
        {!projectId && <Hub onPick={pickProject} />}
        {projectId && !view && <div style={{ padding: 40 }}>{loadErr ? <div className="gate"><b>Couldn't load project.</b> {loadErr} <button className="btn" onClick={closeProject}>Back</button></div> : <><span className="spinner" /> Loading…</>}</div>}
        {projectId && view && <Shell view={view} reload={reload} applyView={applyView} closeProject={closeProject} />}
        {toast && <div className={`toast ${toast.kind === 'bad' ? 'bad' : ''}`}>{toast.msg}</div>}
        {busy && <div className="toast"><span className="spinner" /> {busy}</div>}
      </BusyCtx.Provider>
    </ToastCtx.Provider>
  );
}
