import type { ProjectView, Job } from './types';

const BASE = '/api';

async function req<T = any>(method: string, path: string, body?: any): Promise<T> {
  const res = await fetch(BASE + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any = text;
  try { data = text ? JSON.parse(text) : null; } catch { /* keep as text */ }
  if (!res.ok) { const err: any = new Error(data?.error || `${method} ${path} → ${res.status}`); err.gate = data?.gate; err.status = res.status; throw err; }
  return data as T;
}

export const api = {
  health: () => req('GET', '/health'),
  llmProbe: (projectId?: string) => req('GET', `/llm/probe${projectId ? `?project=${projectId}` : ''}`),

  listProjects: () => req<{ projects: { id: string; slug: string; title: string; created_at: string; updated_at: string }[] }>('GET', '/projects'),
  createProject: (title: string) => req('POST', '/projects', { title }),
  getProject: (id: string) => req<ProjectView>('GET', `/projects/${id}`),
  deleteProject: (id: string) => req('DELETE', `/projects/${id}`),

  previewIngest: (story: string, visuals: string) => req('POST', '/ingest/preview', { story, visuals }),
  ingest: (story: string, visuals: string, title?: string) => req('POST', '/ingest', { story, visuals, title }),

  advance: (id: string) => req<ProjectView>('POST', `/projects/${id}/stage/advance`),
  revert: (id: string, targetStage: string) => req<ProjectView>('POST', `/projects/${id}/stage/revert`, { targetStage }),

  patchSystemRule: (id: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/system-rule`, body),
  patchAiSettings: (id: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/ai-settings`, body),
  patchMeta: (id: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/meta`, body),
  patchCharacter: (id: string, cid: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/characters/${cid}`, body),
  patchLocation: (id: string, lid: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/locations/${lid}`, body),
  patchPanel: (id: string, pnid: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/panels/${pnid}`, body),
  patchPage: (id: string, pid: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/pages/${pid}`, body),
  relayout: (id: string, pid: string, body: any) => req<ProjectView>('POST', `/projects/${id}/pages/${pid}/relayout`, body),
  movePanel: (id: string, pid: string, panelId: string, toIndex: number) => req<ProjectView>('POST', `/projects/${id}/pages/${pid}/move-panel`, { panelId, toIndex }),
  putLayout: (id: string, pid: string, panels: { panelId: string; x: number; y: number; w: number; h: number }[], readingDir?: string) => req<ProjectView>('PUT', `/projects/${id}/pages/${pid}/layout`, { panels, readingDir }),

  aiCleanupStory: (id: string) => req<ProjectView>('POST', `/projects/${id}/ai/cleanup-story`),
  aiFillCast: (id: string, force = false) => req<ProjectView & { total: number; llmUsed?: number }>('POST', `/projects/${id}/ai/fill-cast`, { force }),
  aiFillPages: (id: string, pageId?: string, force = false) => req<ProjectView & { total: number; llmUsed?: number }>('POST', `/projects/${id}/ai/fill-pages`, { pageId, force }),
  aiFillCharacter: (id: string, cid: string) => req<ProjectView>('POST', `/projects/${id}/ai/fill-character/${cid}`),
  aiFillLocation: (id: string, lid: string) => req<ProjectView>('POST', `/projects/${id}/ai/fill-location/${lid}`),
  aiCompilePanel: (id: string, pnid: string) => req<ProjectView>('POST', `/projects/${id}/ai/compile-panel/${pnid}`),
  aiAutoRun: (id: string) => req<ProjectView & { jobId: string }>('POST', `/projects/${id}/ai/auto-run`),

  uploadCharRef: (id: string, cid: string, dataBase64: string, mime: string, name: string) => req<ProjectView>('POST', `/projects/${id}/characters/${cid}/refs`, { dataBase64, mime, name }),
  generateCharRef: (id: string, cid: string) => req<ProjectView>('POST', `/projects/${id}/characters/${cid}/refs/generate`),
  uploadLocRef: (id: string, lid: string, dataBase64: string, mime: string, name: string) => req<ProjectView>('POST', `/projects/${id}/locations/${lid}/refs`, { dataBase64, mime, name }),
  generateLocRef: (id: string, lid: string) => req<ProjectView>('POST', `/projects/${id}/locations/${lid}/refs/generate`),
  removeRef: (id: string, aid: string) => req<ProjectView>('DELETE', `/projects/${id}/refs/${aid}`),

  renderPanel: (id: string, pnid: string, body?: any) => req<ProjectView>('POST', `/projects/${id}/render/panel/${pnid}`, body || {}),
  renderPage: (id: string, pid: string, force = false) => req<ProjectView & { jobId: string; total: number }>('POST', `/projects/${id}/render/page/${pid}`, { force }),
  renderAll: (id: string, force = false) => req<ProjectView & { jobId: string; total: number }>('POST', `/projects/${id}/render/all`, { force }),
  renderHistory: (id: string, pnid: string) => req<{ renders: any[] }>('GET', `/projects/${id}/render/history/${pnid}`),
  rollbackRender: (id: string, pnid: string, renderId: string) => req<ProjectView>('POST', `/projects/${id}/render/rollback/${pnid}`, { renderId }),

  letterPage: (id: string, pid: string) => req<ProjectView>('POST', `/projects/${id}/letter/page/${pid}`),
  letterAll: (id: string) => req<ProjectView>('POST', `/projects/${id}/letter/all`),
  addLettering: (id: string, pid: string, body: any) => req<ProjectView>('POST', `/projects/${id}/pages/${pid}/lettering`, body),
  patchLettering: (id: string, pid: string, lid: string, body: any) => req<ProjectView>('PATCH', `/projects/${id}/pages/${pid}/lettering/${lid}`, body),
  removeLettering: (id: string, pid: string, lid: string) => req<ProjectView>('DELETE', `/projects/${id}/pages/${pid}/lettering/${lid}`),
  runQC: (id: string) => req<ProjectView>('POST', `/projects/${id}/qc/run`),
  approvePage: (id: string, pid: string, approved = true) => req<ProjectView>('POST', `/projects/${id}/pages/${pid}/approve`, { approved }),
  approveAll: (id: string) => req<ProjectView>('POST', `/projects/${id}/pages/approve-all`),

  exportPages: (id: string) => req<{ pages: { pageId: string; number: number; title: string; svg: string }[] }>('GET', `/projects/${id}/export/pages`),
  exportSave: (id: string) => req<{ saved: any[] }>('POST', `/projects/${id}/export/save`),
  pageSvgUrl: (id: string, pid: string) => `${BASE}/projects/${id}/export/page/${pid}.svg`,
  bookHtmlUrl: (id: string, download = false) => `${BASE}/projects/${id}/export/book.html${download ? '?dl=1' : ''}`,
  bookCbzUrl: (id: string) => `${BASE}/projects/${id}/export/book.cbz`,

  jobs: (id: string) => req<{ jobs: Job[] }>('GET', `/projects/${id}/jobs`),
  job: (jid: string) => req<Job>('GET', `/jobs/${jid}`),

  assetUrl: (aid: string) => `${BASE}/assets/${aid}`,
};

export function subscribeProject(id: string, onChange: () => void): () => void {
  const es = new EventSource(`${BASE}/projects/${id}/events`);
  es.addEventListener('project', () => onChange());
  es.onerror = () => { /* browser auto-reconnects */ };
  return () => es.close();
}
