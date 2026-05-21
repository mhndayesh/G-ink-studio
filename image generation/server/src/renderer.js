// renderer.js — drives panel rendering through the image adapter, records every
// render in the `renders` table (history + rollback), and mirrors the current
// render onto the project document. Page/project renders run as jobs with a small
// concurrency cap. One bad panel never aborts a batch.

import { getProject, updateProject, addHistory, putAsset, getAsset, recordRender, listRenders, setCurrentRender, createJob, updateJob } from './db.js';
import { generateImage } from './image/adapter.js';
import { resolvePanelMode } from './ai/rules.js';

const CONCURRENCY = Math.max(1, Number(process.env.PARALLEL_RENDERS || 3));
const inFlight = new Set();   // panelId locks (in-process)

const byId = (arr, id) => (arr || []).find(x => x.id === id) || null;
const assetUrl = id => `/api/assets/${id}`;

// A4 manga page dimensions (must match export/svg.js PAGE_W/PAGE_H).
const PAGE_W = 1240, PAGE_H = 1754;

/**
 * Compute the ComfyUI render size for a panel from its layout cell's aspect ratio.
 * Targets ~921,600 px total (≈ 720×1280), rounded to the nearest 64 px so the VAE
 * is always happy.  Falls back to 720×1280 when no layout cell is found.
 */
function panelRenderSize(project, panel) {
  const page = byId(project.pages, panel.pageId);
  const cell = (page?.layout?.panels || []).find(c => c.panelId === panel.id);
  if (!cell || !cell.w || !cell.h) return { width: 720, height: 1280 };
  const ratio = (cell.w * PAGE_W) / (cell.h * PAGE_H);
  const TARGET_AREA = 720 * 1280;
  const MAX_DIM = 1472; // keep comfy happy; SVG export clips/scales anyway
  let h = Math.max(128, Math.round(Math.sqrt(TARGET_AREA / ratio) / 64) * 64);
  let w = Math.max(128, Math.round(h * ratio / 64) * 64);
  if (w > MAX_DIM) { w = MAX_DIM; h = Math.max(128, Math.round(w / ratio / 64) * 64); }
  if (h > MAX_DIM) { h = MAX_DIM; w = Math.max(128, Math.round(h * ratio / 64) * 64); }
  return { width: w, height: h };
}

const chooseMode = (doc, panel) => resolvePanelMode(doc, panel);

function refBytesFor(doc, panel, mode) {
  const out = [];
  for (const cid of panel.characters || []) for (const aid of (byId(doc.characters, cid)?.refs || [])) { const a = getAsset(aid); if (a) out.push({ bytes: a.bytes, mime: a.mime, assetId: aid }); }
  const loc = byId(doc.locations, panel.locationId);
  for (const aid of (loc?.refs || [])) { const a = getAsset(aid); if (a) out.push({ bytes: a.bytes, mime: a.mime, assetId: aid }); }
  // i2i-2refs feeds exactly two LoadImage nodes; plain i2i feeds one. Cap accordingly.
  return out.slice(0, mode === 'i2i-2refs' ? 2 : mode === 'i2i' ? 1 : 4);
}

/** Render one panel. Returns { renderId, assetId, imageUrl, model, seed, mode } or throws. */
export async function renderPanel(projectId, panelId, { model = null, seed = null } = {}) {
  if (inFlight.has(panelId)) throw new Error('panel is already rendering');
  inFlight.add(panelId);
  try {
    const project = getProject(projectId);
    const panel = byId(project.panels, panelId);
    if (!panel) throw new Error('panel not found');
    if (!panel.imagePrompt || !panel.imagePrompt.trim()) throw new Error('panel has no compiled image prompt');
    const mode = chooseMode(project, panel);
    const refs = (mode === 'i2i' || mode === 'i2i-2refs') ? refBytesFor(project, panel, mode) : [];
    let result, error = null;
    try {
      const size = panelRenderSize(project, panel);
      result = await generateImage({ prompt: panel.imagePrompt, negativePrompt: [project.systemRule?.negative, panel.negativeAddon].filter(Boolean).join(', '), model: model || panel.render?.model, seed, mode, label: `Ch — Page ${panelNumberLabel(project, panel)}`, refs, ...size });
    } catch (e) { error = String(e.message || e); }

    if (error) {
      const renderId = recordRender(projectId, { panelId, pageId: panel.pageId, status: 'error', error, mode });
      updateProject(projectId, doc => { const p = byId(doc.panels, panelId); p.render = { ...p.render, status: 'error', error, renderId }; addHistory(doc, 'render:error', { panelId, error }); }, { action: 'render:error' });
      throw new Error(error);
    }
    const assetId = putAsset(projectId, { kind: 'render', mime: result.mime, bytes: result.bytes, width: result.width, height: result.height, sourceName: `${panelId}.${extOf(result.mime)}` });
    const renderId = recordRender(projectId, { panelId, pageId: panel.pageId, assetId, model: result.model, seed: result.seed, mode, prompt: panel.imagePrompt, negative: panel.negativeAddon, refAssetIds: refs.map(r => r.assetId).filter(Boolean), status: 'done' });
    updateProject(projectId, doc => {
      const p = byId(doc.panels, panelId);
      p.render = { status: 'done', model: result.model, seed: result.seed, assetId, imageUrl: assetUrl(assetId), renderId, error: null, backend: result.backend, at: new Date().toISOString() };
      p._renderStale = false; if (p.qc) p.qc.status = 'unchecked';
      addHistory(doc, 'render:done', { panelId, renderId });
    }, { action: 'render:done' });
    return { renderId, assetId, imageUrl: assetUrl(assetId), model: result.model, seed: result.seed, mode };
  } finally { inFlight.delete(panelId); }
}

function panelNumberLabel(project, panel) {
  const page = byId(project.pages, panel.pageId);
  return `${page ? page.number : '?'} · panel ${panel.number}`;
}
function extOf(mime) { return mime.includes('svg') ? 'svg' : mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'; }

async function runPool(items, worker, concurrency, onEach) {
  const queue = items.slice(); let active = 0; let done = 0; const errors = [];
  return new Promise(resolve => {
    const pump = () => {
      if (!queue.length && active === 0) return resolve({ done, errors });
      while (active < concurrency && queue.length) {
        const it = queue.shift(); active++;
        worker(it).then(() => {}).catch(e => errors.push({ item: it, error: String(e.message || e) })).finally(() => { active--; done++; onEach?.(done, items.length, it); pump(); });
      }
    };
    pump();
  });
}

/** Render a set of panels as a job. Pass { wait: true } to await the whole batch (used by Auto-run). */
export async function renderBatch(projectId, { pageId = null, panelIds = null, force = false, model = null, wait = false } = {}) {
  const project = getProject(projectId);
  let panels = project.panels || [];
  if (pageId) panels = panels.filter(p => p.pageId === pageId);
  if (panelIds) panels = panels.filter(p => panelIds.includes(p.id));
  const targets = panels.filter(p => (p.imagePrompt && p.imagePrompt.trim()) && (force || !(p.render?.status === 'done' && p.render.assetId && !p._renderStale)));
  const jobId = createJob(projectId, 'render', { pageId, force }, targets.length);
  if (!targets.length) { updateJob(jobId, { status: 'done', progress: 1, message: 'Nothing to render.' }); return { jobId, total: 0, errors: [] }; }
  const runIt = async () => {
    const { done, errors } = await runPool(targets, p => renderPanel(projectId, p.id, { model }), CONCURRENCY, (d, t) => updateJob(jobId, { progress: d / t, total: t, message: `Rendered ${d}/${t}` }));
    updateJob(jobId, { status: 'done', progress: 1, total: targets.length, message: errors.length ? `Done with ${errors.length} error(s).` : `Rendered ${done} panel(s).`, error: errors.length ? errors.map(e => `${e.item.id}: ${e.error}`).join('; ').slice(0, 500) : null });
    return { done, errors };
  };
  if (wait) { const { errors } = await runIt(); return { jobId, total: targets.length, errors }; }
  runIt();
  return { jobId, total: targets.length, errors: [] };
}

export function rollbackPanelRender(projectId, panelId, renderId) {
  const r = setCurrentRender(projectId, panelId, renderId);
  if (!r) throw new Error('render not found for that panel');
  return updateProject(projectId, doc => {
    const p = byId(doc.panels, panelId);
    p.render = { status: 'done', model: r.model, seed: r.seed, assetId: r.asset_id, imageUrl: assetUrl(r.asset_id), renderId: r.id, error: null, at: r.created_at };
    p._renderStale = false; if (p.qc) p.qc.status = 'unchecked';
    addHistory(doc, 'render:rollback', { panelId, renderId });
  }, { action: 'render:rollback' });
}

export function panelRenderHistory(projectId, panelId) {
  return listRenders(projectId, panelId).map(r => ({ id: r.id, status: r.status, model: r.model, seed: r.seed, mode: r.mode, imageUrl: r.asset_id ? assetUrl(r.asset_id) : null, isCurrent: !!r.is_current, error: r.error, at: r.created_at }));
}

/** Generate a reference image for a character or location and add it to their refs[]. */
export async function generateRef(projectId, kind, entityId) {
  const project = getProject(projectId);
  const entity = kind === 'character'
    ? byId(project.characters, entityId)
    : byId(project.locations, entityId);
  if (!entity) throw new Error(`${kind} not found`);
  if (!entity.imagePrompt || !entity.imagePrompt.trim()) throw new Error(`${kind} has no image prompt — fill the look first`);

  const size = kind === 'character' ? { width: 768, height: 1024 } : { width: 1024, height: 768 };
  const result = await generateImage({
    prompt: entity.imagePrompt,
    negativePrompt: [project.systemRule?.negative, entity.negativeAddon].filter(Boolean).join(', '),
    mode: 't2i', seed: null, label: entity.name, ...size,
  });

  const assetId = putAsset(projectId, { kind: 'ref', mime: result.mime, bytes: result.bytes, width: result.width, height: result.height, sourceName: `${kind}-ref-${entityId}.${extOf(result.mime)}` });
  return updateProject(projectId, doc => {
    const e = kind === 'character' ? byId(doc.characters, entityId) : byId(doc.locations, entityId);
    e.refs = [...new Set([...(e.refs || []), assetId])];
    addHistory(doc, 'ref:generate', { kind, entityId, assetId });
  }, { action: 'ref:generate' });
}
