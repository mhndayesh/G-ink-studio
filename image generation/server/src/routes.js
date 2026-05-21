// routes.js — the HTTP API. Thin handlers over db.js / stages.js / ai/director.js
// / renderer.js / lettering.js / export. Everything that mutates goes through
// updateProject() so the document schema is always enforced.

import { Router } from 'express';
import {
  listProjects, getProject, createProject, deleteProject, updateProject, addHistory,
  getAsset, putAsset, projectBus, listJobs, getJob,
} from './db.js';
import { newProjectDoc, STAGES, CAMERA_SHOTS, RENDER_MODES, isCameraShot } from './docSchema.js';
import { normalizeCameraShot } from './ai/shots.js';
import { STAGE_META, unlockedStages, evalGate, advanceStage, revertStage } from './stages.js';
import { llmStatus, probeLLM } from './ai/llm.js';
import { imageStatus } from './image/adapter.js';
import { allRules } from './ai/rules.js';
import { aiCleanupStory, aiFillCast, aiFillPages, aiFillOneCharacter, aiFillOneLocation, aiCompileOnePanel, aiAutoRun } from './ai/director.js';
import { renderPanel, renderBatch, rollbackPanelRender, panelRenderHistory, generateRef } from './renderer.js';
import { buildLetteringForPage, qcPanel } from './lettering.js';
import { relayoutPage, sanitizeCells, LAYOUT_TEMPLATES } from './layout.js';
import { exportPageSvg, exportAllPages } from './export/svg.js';
import { buildBookHtml, buildCbz, slugTitle } from './export/bundle.js';
import { previewIngest, buildProjectFromBundle } from './ingest/index.js';
import { localId } from './docSchema.js';

const r = Router();
const byId = (arr, id) => (arr || []).find(x => x.id === id) || null;
const wrap = fn => (req, res) => Promise.resolve(fn(req, res))
  .then(out => { if (!res.headersSent) res.json(out ?? {}); })
  .catch(err => { if (!res.headersSent) res.status(err.status || 400).json({ error: String(err.message || err), gate: err.gate || undefined }); });
const need = (obj, what) => { if (!obj) { const e = new Error(`${what} not found`); e.status = 404; throw e; } return obj; };

/** Pull only the listed keys from a body. */
function pick(body, keys) { const o = {}; for (const k of keys) if (k in (body || {})) o[k] = body[k]; return o; }

function projectView(doc) {
  const gate = evalGate(doc, doc.currentStage);
  return {
    project: doc,
    stages: unlockedStages(doc),
    stageMeta: STAGE_META,
    currentGate: gate,
    nextStage: STAGES[STAGES.indexOf(doc.currentStage) + 1] || null,
    rules: allRules(doc),
    llm: llmStatus(doc),
    image: imageStatus(),
    cameraShots: CAMERA_SHOTS,
    renderModes: RENDER_MODES,
  };
}

// ─── meta / health ───────────────────────────────────────────────────────────

r.get('/health', (req, res) => res.json({ ok: true, llm: llmStatus(), image: imageStatus(), stages: STAGES }));
r.get('/llm/probe', wrap(async req => probeLLM(req.query.project ? getProject(req.query.project) : undefined)));

// ─── projects ────────────────────────────────────────────────────────────────

r.get('/projects', (req, res) => res.json({ projects: listProjects() }));
r.post('/projects', wrap(async req => createProject(newProjectDoc(req.body?.title || 'Untitled Manga'))));
r.get('/projects/:id', wrap(async req => projectView(need(getProject(req.params.id), 'project'))));
r.delete('/projects/:id', wrap(async req => ({ deleted: deleteProject(req.params.id) })));

// SSE
r.get('/projects/:id/events', (req, res) => {
  const doc = getProject(req.params.id); if (!doc) return res.status(404).end();
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: {}\n\n`);
  const onUpd = ev => { if (ev.projectId === doc.id) res.write(`event: project\ndata: ${JSON.stringify(ev)}\n\n`); };
  projectBus.on('project:updated', onUpd);
  const ka = setInterval(() => res.write(`:ka\n\n`), 25000);
  req.on('close', () => { clearInterval(ka); projectBus.off('project:updated', onUpd); });
});

// ─── ingest (Story stage) ────────────────────────────────────────────────────

r.post('/ingest/preview', wrap(async req => previewIngest({ story: req.body?.story, visuals: req.body?.visuals })));
r.post('/ingest', wrap(async req => {
  const { story, visuals, title } = req.body || {};
  if (!story && !visuals) { const e = new Error('Provide at least a story or visuals file'); e.status = 400; throw e; }
  const doc = buildProjectFromBundle({ story, visuals }, { title });
  return createProject(doc);
}));

// ─── stage transitions ───────────────────────────────────────────────────────

r.post('/projects/:id/stage/advance', wrap(async req => projectView(advanceStage(req.params.id))));
r.post('/projects/:id/stage/revert', wrap(async req => {
  const target = req.body?.targetStage; if (!STAGES.includes(target)) { const e = new Error('bad targetStage'); e.status = 400; throw e; }
  return projectView(revertStage(req.params.id, target));
}));
r.get('/projects/:id/gate/:stage', wrap(async req => { const doc = need(getProject(req.params.id), 'project'); return { stage: req.params.stage, ...evalGate(doc, req.params.stage) }; }));

// ─── document edits ──────────────────────────────────────────────────────────

r.patch('/projects/:id/system-rule', wrap(async req => projectView(updateProject(req.params.id, doc => { Object.assign(doc.systemRule, pick(req.body, ['positive', 'negative'])); addHistory(doc, 'edit:systemRule'); }, { action: 'edit:systemRule' }))));
r.patch('/projects/:id/ai-settings', wrap(async req => projectView(updateProject(req.params.id, doc => { Object.assign(doc.aiSettings, pick(req.body, ['provider', 'model', 'autoApprove', 'autoLetter'])); }, { action: 'edit:aiSettings' }))));
r.patch('/projects/:id/meta', wrap(async req => projectView(updateProject(req.params.id, doc => { Object.assign(doc, pick(req.body, ['title', 'synopsis', 'genre', 'worldNotes'])); }, { action: 'edit:meta' }))));

r.patch('/projects/:id/characters/:cid', wrap(async req => projectView(updateProject(req.params.id, doc => { const c = need(byId(doc.characters, req.params.cid), 'character'); Object.assign(c, pick(req.body, ['name', 'role', 'aliases', 'sheet', 'imagePrompt', 'imagePromptLocked', 'promptAddon', 'negativeAddon'])); addHistory(doc, 'edit:character', { id: c.id }); }, { action: 'edit:character' }))));
r.patch('/projects/:id/locations/:lid', wrap(async req => projectView(updateProject(req.params.id, doc => { const l = need(byId(doc.locations, req.params.lid), 'location'); Object.assign(l, pick(req.body, ['name', 'type', 'description', 'imagePrompt', 'imagePromptLocked', 'promptAddon', 'negativeAddon'])); addHistory(doc, 'edit:location', { id: l.id }); }, { action: 'edit:location' }))));
r.patch('/projects/:id/panels/:pnid', wrap(async req => projectView(updateProject(req.params.id, doc => {
  const p = need(byId(doc.panels, req.params.pnid), 'panel');
  const patch = pick(req.body, ['visual', 'action', 'mood', 'cameraShot', 'pacing', 'characters', 'locationId', 'narration', 'dialogue', 'sfxText', 'imagePrompt', 'imagePromptLocked', 'promptAddon', 'negativeAddon', 'renderMode']);
  if ('characters' in patch) patch.characters = [...new Set((patch.characters || []).filter(id => doc.characters.some(c => c.id === id)))];
  if ('locationId' in patch && patch.locationId && !doc.locations.some(l => l.id === patch.locationId)) delete patch.locationId;
  if ('cameraShot' in patch) { const norm = normalizeCameraShot(patch.cameraShot); if (!isCameraShot(norm)) delete patch.cameraShot; else patch.cameraShot = norm; }
  if ('renderMode' in patch && !RENDER_MODES.includes(patch.renderMode)) delete patch.renderMode;
  // editing prompt-affecting fields after Pages invalidates the compiled prompt
  const promptish = ['visual', 'action', 'mood', 'cameraShot', 'characters', 'locationId', 'renderMode'];
  if (promptish.some(k => k in patch) && !('imagePrompt' in patch)) p._promptStale = true;
  Object.assign(p, patch);
  addHistory(doc, 'edit:panel', { id: p.id });
}, { action: 'edit:panel' }))));

r.patch('/projects/:id/pages/:pid', wrap(async req => projectView(updateProject(req.params.id, doc => {
  const pg = need(byId(doc.pages, req.params.pid), 'page');
  Object.assign(pg, pick(req.body, ['sceneLabel', 'scenePurpose', 'mood', 'approved']));
  if (req.body?.layoutTemplate && LAYOUT_TEMPLATES.includes(req.body.layoutTemplate)) { pg.layout.template = req.body.layoutTemplate; relayoutPage(pg, pg.layout.panels.map(c => c.panelId)); }
  if (req.body?.readingDir) { pg.layout.readingDir = req.body.readingDir === 'ltr' ? 'ltr' : 'rtl'; relayoutPage(pg, pg.layout.panels.map(c => c.panelId)); }
  addHistory(doc, 'edit:page', { id: pg.id });
}, { action: 'edit:page' }))));
r.post('/projects/:id/pages/:pid/relayout', wrap(async req => projectView(updateProject(req.params.id, doc => {
  const pg = need(byId(doc.pages, req.params.pid), 'page');
  const order = Array.isArray(req.body?.order) && req.body.order.length ? req.body.order.filter(id => doc.panels.some(p => p.id === id && p.pageId === pg.id)) : pg.layout.panels.map(c => c.panelId);
  if (req.body?.template && LAYOUT_TEMPLATES.includes(req.body.template)) pg.layout.template = req.body.template;
  relayoutPage(pg, order); addHistory(doc, 'edit:relayout', { id: pg.id });
}, { action: 'edit:relayout' }))));
r.post('/projects/:id/pages/:pid/move-panel', wrap(async req => projectView(updateProject(req.params.id, doc => {
  const pg = need(byId(doc.pages, req.params.pid), 'page'); const { panelId, toIndex } = req.body || {};
  const ids = pg.layout.panels.map(c => c.panelId); const from = ids.indexOf(panelId); if (from < 0) throw new Error('panel not on this page');
  ids.splice(from, 1); ids.splice(Math.max(0, Math.min(ids.length, toIndex ?? ids.length)), 0, panelId);
  relayoutPage(pg, ids); addHistory(doc, 'edit:movePanel', { id: pg.id, panelId });
}, { action: 'edit:movePanel' }))));
// custom drag-to-resize layout: client posts the full set of cells (x/y/w/h in 0..100)
r.put('/projects/:id/pages/:pid/layout', wrap(async req => projectView(updateProject(req.params.id, doc => {
  const pg = need(byId(doc.pages, req.params.pid), 'page');
  const order = pg.layout.panels.map(c => c.panelId);                       // preserve reading order
  pg.layout.panels = sanitizeCells(req.body?.panels || [], order);
  pg.layout.template = 'custom';
  if (req.body?.readingDir) pg.layout.readingDir = req.body.readingDir === 'ltr' ? 'ltr' : 'rtl';
  addHistory(doc, 'edit:layout', { id: pg.id });
}, { action: 'edit:layout' }))));

// ─── AI buttons ──────────────────────────────────────────────────────────────

r.post('/projects/:id/ai/cleanup-story', wrap(async req => projectView(aiCleanupStory(req.params.id))));
r.post('/projects/:id/ai/fill-cast', wrap(async req => { const out = await aiFillCast(req.params.id, { force: !!req.body?.force }); return { ...out, ...projectView(getProject(req.params.id)) }; }));
r.post('/projects/:id/ai/fill-pages', wrap(async req => { const out = await aiFillPages(req.params.id, { pageId: req.body?.pageId || null, force: !!req.body?.force }); return { ...out, ...projectView(getProject(req.params.id)) }; }));
r.post('/projects/:id/ai/fill-character/:cid', wrap(async req => { await aiFillOneCharacter(req.params.id, req.params.cid); return projectView(getProject(req.params.id)); }));
r.post('/projects/:id/ai/fill-location/:lid', wrap(async req => { await aiFillOneLocation(req.params.id, req.params.lid); return projectView(getProject(req.params.id)); }));
r.post('/projects/:id/ai/compile-panel/:pnid', wrap(async req => { await aiCompileOnePanel(req.params.id, req.params.pnid); return projectView(getProject(req.params.id)); }));
r.post('/projects/:id/ai/auto-run', wrap(async req => { const out = await aiAutoRun(req.params.id); return { ...out, ...projectView(getProject(req.params.id)) }; }));

// ─── reference image upload (Cast stage) ─────────────────────────────────────

function decodeUpload(body) {
  const b64 = String(body?.dataBase64 || '').replace(/^data:[^,]+,/, '');
  if (!b64) throw new Error('dataBase64 required');
  return { bytes: Buffer.from(b64, 'base64'), mime: body.mime || 'image/png', sourceName: body.name || 'reference' };
}
// changing an entity's reference images changes which render mode (and therefore which prompt FORMAT) its panels use → mark them stale
function markPanelsStaleForCharacter(doc, cid) { for (const p of doc.panels) if ((p.characters || []).includes(cid) && !p.imagePromptLocked) p._promptStale = true; }
function markPanelsStaleForLocation(doc, lid) { for (const p of doc.panels) if (p.locationId === lid && !p.imagePromptLocked) p._promptStale = true; }

r.post('/projects/:id/characters/:cid/refs', wrap(async req => { const up = decodeUpload(req.body); const aid = putAsset(req.params.id, { kind: 'ref', ...up }); return projectView(updateProject(req.params.id, doc => { const c = need(byId(doc.characters, req.params.cid), 'character'); c.refs = [...new Set([...(c.refs || []), aid])]; markPanelsStaleForCharacter(doc, c.id); addHistory(doc, 'ref:add', { characterId: c.id, aid }); }, { action: 'ref:add' })); }));
r.post('/projects/:id/characters/:cid/refs/generate', wrap(async req => projectView(await generateRef(req.params.id, 'character', req.params.cid))));
r.post('/projects/:id/locations/:lid/refs', wrap(async req => { const up = decodeUpload(req.body); const aid = putAsset(req.params.id, { kind: 'ref', ...up }); return projectView(updateProject(req.params.id, doc => { const l = need(byId(doc.locations, req.params.lid), 'location'); l.refs = [...new Set([...(l.refs || []), aid])]; markPanelsStaleForLocation(doc, l.id); addHistory(doc, 'ref:add', { locationId: l.id, aid }); }, { action: 'ref:add' })); }));
r.post('/projects/:id/locations/:lid/refs/generate', wrap(async req => projectView(await generateRef(req.params.id, 'location', req.params.lid))));
r.delete('/projects/:id/refs/:aid', wrap(async req => projectView(updateProject(req.params.id, doc => { for (const c of doc.characters) if ((c.refs || []).includes(req.params.aid)) { c.refs = c.refs.filter(x => x !== req.params.aid); markPanelsStaleForCharacter(doc, c.id); } for (const l of doc.locations) if ((l.refs || []).includes(req.params.aid)) { l.refs = l.refs.filter(x => x !== req.params.aid); markPanelsStaleForLocation(doc, l.id); } addHistory(doc, 'ref:remove', { aid: req.params.aid }); }, { action: 'ref:remove' }))));

// ─── assets ──────────────────────────────────────────────────────────────────

r.get('/assets/:aid', (req, res) => { const a = getAsset(req.params.aid); if (!a) return res.status(404).end(); res.set('Content-Type', a.mime); res.set('Cache-Control', 'public, max-age=31536000, immutable'); res.send(Buffer.from(a.bytes)); });

// ─── render (Render stage) ───────────────────────────────────────────────────

r.post('/projects/:id/render/panel/:pnid', wrap(async req => { await renderPanel(req.params.id, req.params.pnid, { seed: req.body?.seed ?? null, model: req.body?.model ?? null }); return projectView(getProject(req.params.id)); }));
r.post('/projects/:id/render/page/:pid', wrap(async req => { const out = await renderBatch(req.params.id, { pageId: req.params.pid, force: !!req.body?.force }); return { ...out, ...projectView(getProject(req.params.id)) }; }));
r.post('/projects/:id/render/all', wrap(async req => { const out = await renderBatch(req.params.id, { force: !!req.body?.force }); return { ...out, ...projectView(getProject(req.params.id)) }; }));
r.get('/projects/:id/render/history/:pnid', wrap(async req => ({ renders: panelRenderHistory(req.params.id, req.params.pnid) })));
r.post('/projects/:id/render/rollback/:pnid', wrap(async req => { rollbackPanelRender(req.params.id, req.params.pnid, req.body?.renderId); return projectView(getProject(req.params.id)); }));

// ─── lettering + QC + approve (Letter & Export stage) ────────────────────────

function applyLetteringToPage(doc, pageId, replace = true) {
  const pg = need(byId(doc.pages, pageId), 'page');
  const fresh = buildLetteringForPage(doc, pg);
  pg.lettering = replace ? fresh : [...(pg.lettering || []), ...fresh];
  pg._letteringStale = false;
  return pg;
}
r.post('/projects/:id/letter/page/:pid', wrap(async req => projectView(updateProject(req.params.id, doc => { applyLetteringToPage(doc, req.params.pid, true); addHistory(doc, 'letter:page', { id: req.params.pid }); }, { action: 'letter:page' }))));
r.post('/projects/:id/letter/all', wrap(async req => projectView(updateProject(req.params.id, doc => { for (const pg of doc.pages) applyLetteringToPage(doc, pg.id, true); addHistory(doc, 'letter:all'); }, { action: 'letter:all' }))));
r.post('/projects/:id/pages/:pid/lettering', wrap(async req => projectView(updateProject(req.params.id, doc => { const pg = need(byId(doc.pages, req.params.pid), 'page'); const { panelId, type = 'speech', text = '' } = req.body || {}; pg.lettering.push({ id: localId('let'), panelId: panelId || null, type, text, x: 30, y: 10, w: 35, h: 14, fontSize: 3.2, rotation: 0, speaker: null }); addHistory(doc, 'letter:add', { id: pg.id }); }, { action: 'letter:add' }))));
r.patch('/projects/:id/pages/:pid/lettering/:lid', wrap(async req => projectView(updateProject(req.params.id, doc => { const pg = need(byId(doc.pages, req.params.pid), 'page'); const l = need(byId(pg.lettering, req.params.lid), 'lettering'); Object.assign(l, pick(req.body, ['type', 'text', 'x', 'y', 'w', 'h', 'fontSize', 'rotation', 'speaker', 'whisper', 'shout', 'panelId'])); addHistory(doc, 'letter:edit', { id: pg.id }); }, { action: 'letter:edit' }))));
r.delete('/projects/:id/pages/:pid/lettering/:lid', wrap(async req => projectView(updateProject(req.params.id, doc => { const pg = need(byId(doc.pages, req.params.pid), 'page'); pg.lettering = pg.lettering.filter(l => l.id !== req.params.lid); addHistory(doc, 'letter:remove', { id: pg.id }); }, { action: 'letter:remove' }))));

r.post('/projects/:id/qc/run', wrap(async req => projectView(updateProject(req.params.id, doc => { let bad = 0; for (const p of doc.panels) { p.qc = qcPanel(doc, p); if (p.qc.status !== 'passed') bad++; } addHistory(doc, 'qc:run', { needsFix: bad }); }, { action: 'qc:run' }))));
r.post('/projects/:id/pages/:pid/approve', wrap(async req => projectView(updateProject(req.params.id, doc => { const pg = need(byId(doc.pages, req.params.pid), 'page'); pg.approved = req.body?.approved !== false; addHistory(doc, 'page:approve', { id: pg.id, approved: pg.approved }); }, { action: 'page:approve' }))));
r.post('/projects/:id/pages/approve-all', wrap(async req => projectView(updateProject(req.params.id, doc => { for (const pg of doc.pages) pg.approved = true; addHistory(doc, 'page:approveAll'); }, { action: 'page:approveAll' }))));

// ─── export ──────────────────────────────────────────────────────────────────

r.get('/projects/:id/export/pages', wrap(async req => ({ pages: exportAllPages(need(getProject(req.params.id), 'project')) })));
r.get('/projects/:id/export/page/:pid.svg', (req, res) => { const doc = getProject(req.params.id); if (!doc) return res.status(404).end(); const pg = byId(doc.pages, req.params.pid); if (!pg) return res.status(404).end(); res.set('Content-Type', 'image/svg+xml'); res.set('Content-Disposition', `attachment; filename="page-${pg.number}.svg"`); res.send(exportPageSvg(doc, pg)); });
r.get('/projects/:id/export/book.html', (req, res) => { const doc = getProject(req.params.id); if (!doc) return res.status(404).end(); res.set('Content-Type', 'text/html; charset=utf-8'); res.set('Content-Disposition', `${req.query.dl ? 'attachment; ' : ''}filename="${slugTitle(doc)}.html"`); res.send(buildBookHtml(doc)); });
r.get('/projects/:id/export/book.cbz', (req, res) => { const doc = getProject(req.params.id); if (!doc) return res.status(404).end(); res.set('Content-Type', 'application/vnd.comicbook+zip'); res.set('Content-Disposition', `attachment; filename="${slugTitle(doc)}.cbz"`); res.send(buildCbz(doc)); });
r.post('/projects/:id/export/save', wrap(async req => {
  const doc = need(getProject(req.params.id), 'project');
  const saved = exportAllPages(doc).map(p => ({ pageId: p.pageId, number: p.number, assetId: putAsset(doc.id, { kind: 'export', mime: 'image/svg+xml', bytes: Buffer.from(p.svg, 'utf8'), sourceName: `page-${p.number}.svg` }) }));
  updateProject(doc.id, d => { addHistory(d, 'export:save', { pages: saved.length }); d._lastExport = { at: new Date().toISOString(), pages: saved }; }, { action: 'export:save' });
  return { saved };
}));

// ─── jobs ────────────────────────────────────────────────────────────────────

r.get('/projects/:id/jobs', wrap(async req => ({ jobs: listJobs(req.params.id) })));
r.get('/jobs/:jid', wrap(async req => need(getJob(req.params.jid), 'job')));

export default r;
