// image/adapter.js — pluggable image generation.
//
// IMAGE_SERVER_TYPE:
//   placeholder (default) — no GPU needed; renders a tidy SVG card with the panel
//                           number + prompt. The whole pipeline (incl. export) runs
//                           end-to-end with zero setup.
//   http                  — POST {IMAGE_SERVER_URL}/generate with a job JSON;
//                           expects { imageBase64 } or { imageUrl } back. Use this for
//                           any hosted SD/SDXL service or a custom shim.
//   comfyui               — talks the real ComfyUI HTTP API at IMAGE_SERVER_URL
//                           (e.g. http://localhost:8188): submits a workflow to
//                           /prompt, polls /history, fetches the output via /view.
//                           Ships a default SDXL txt2img workflow; override the file
//                           with COMFY_WORKFLOW_PATH and the node ids with the
//                           COMFY_*_NODE env vars below.

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// sharp is optional — only needed for i2i-2refs ref stitching. Loaded lazily so
// placeholder mode (no GPU, no sharp) works without it.
let _sharp = null;
async function getSharp() {
  if (_sharp) return _sharp;
  try {
    const req = createRequire(import.meta.url);
    _sharp = req('sharp');
    return _sharp;
  } catch {
    return null;
  }
}

const ENV = process.env;
const TYPE = (ENV.IMAGE_SERVER_TYPE || 'placeholder').toLowerCase();
const URL = (ENV.IMAGE_SERVER_URL || '').replace(/\/$/, '');
const TIMEOUT = Number(ENV.IMAGE_SERVER_TIMEOUT_MS || 300000);

export function imageStatus() {
  const configured = TYPE !== 'placeholder' && !!URL;
  return { type: TYPE, url: URL || null, configured, label: TYPE === 'placeholder' ? 'Placeholder (no GPU)' : `${TYPE} @ ${URL}` };
}

// ─── placeholder ─────────────────────────────────────────────────────────────

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function wrapText(text, perLine, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > perLine) { lines.push(cur.trim()); cur = w; if (lines.length >= maxLines) break; } else cur = (cur + ' ' + w).trim(); }
  if (cur && lines.length < maxLines) lines.push(cur.trim());
  if (lines.length === maxLines && words.length) lines[maxLines - 1] = lines[maxLines - 1].replace(/\W*$/, '') + '…';
  return lines;
}
function placeholderSvg({ prompt, label, width, height }) {
  const lines = wrapText(prompt, Math.floor(width / 9), 10);
  const ty = height / 2 - (lines.length * 11);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs><pattern id="h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#000" stroke-width="1" stroke-opacity="0.06"/></pattern></defs>
<rect width="100%" height="100%" fill="#f6f6f4"/><rect width="100%" height="100%" fill="url(#h)"/>
<rect x="6" y="6" width="${width - 12}" height="${height - 12}" fill="none" stroke="#111" stroke-width="3"/>
<text x="18" y="34" font-family="Georgia, serif" font-size="22" font-weight="bold" fill="#111">${esc(label)}</text>
<text x="18" y="56" font-family="Georgia, serif" font-size="12" fill="#555">placeholder render — set IMAGE_SERVER_TYPE=comfyui (or http) for real art</text>
${lines.map((l, i) => `<text x="${width / 2}" y="${ty + i * 22}" text-anchor="middle" font-family="ui-monospace, monospace" font-size="13" fill="#222">${esc(l)}</text>`).join('\n')}
</svg>`;
}

// ─── generic http ────────────────────────────────────────────────────────────

async function callHttp(job) {
  if (!URL) throw new Error('IMAGE_SERVER_URL is not set');
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const res = await fetch(`${URL}/generate`, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify(job) });
    if (!res.ok) throw new Error(`image server ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (data.imageBase64) return { bytes: Buffer.from(data.imageBase64.replace(/^data:[^,]+,/, ''), 'base64'), mime: data.mime || 'image/png', width: data.width || job.width, height: data.height || job.height };
    if (data.imageUrl) { const r2 = await fetch(data.imageUrl); if (!r2.ok) throw new Error(`fetch imageUrl ${r2.status}`); return { bytes: Buffer.from(await r2.arrayBuffer()), mime: r2.headers.get('content-type') || 'image/png', width: job.width, height: job.height }; }
    throw new Error('image server returned neither imageBase64 nor imageUrl');
  } finally { clearTimeout(t); }
}

// ─── ComfyUI ─────────────────────────────────────────────────────────────────

// Default t2i workflow (SDXL). Node IDs match COMFY constants below.
const DEFAULT_T2I_WORKFLOW = {
  '3': { class_type: 'KSampler', inputs: { seed: 0, steps: 28, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 1, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['5', 0] } },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
  '5': { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216, batch_size: 1 } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
  '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
  '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'gink', images: ['8', 0] } },
};

// Default i2i workflow — replaces EmptyLatentImage with LoadImage → VAEEncode.
// Node 10 = VAEEncode, node 11 = LoadImage (filename patched at runtime).
const DEFAULT_I2I_WORKFLOW = {
  '3': { class_type: 'KSampler', inputs: { seed: 0, steps: 28, cfg: 7, sampler_name: 'dpmpp_2m', scheduler: 'karras', denoise: 0.75, model: ['4', 0], positive: ['6', 0], negative: ['7', 0], latent_image: ['10', 0] } },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['4', 1] } },
  '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
  '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'gink', images: ['8', 0] } },
  '10': { class_type: 'VAEEncode', inputs: { pixels: ['11', 0], vae: ['4', 2] } },
  '11': { class_type: 'LoadImage', inputs: { image: 'reference.png' } },
};

const COMFY = {
  positiveNode: ENV.COMFY_POSITIVE_NODE || '6',
  negativeNode: ENV.COMFY_NEGATIVE_NODE || '7',
  samplerNode: ENV.COMFY_SAMPLER_NODE || '3',
  sizeNode: ENV.COMFY_SIZE_NODE || '5',
  // LoadImage node ids — for Qwen image-edit / multi-ref workflows, set
  // COMFY_LOAD_IMAGE_NODES="11,12,13" to fan refs out to multiple LoadImage nodes.
  loadImageNodes: (ENV.COMFY_LOAD_IMAGE_NODES || ENV.COMFY_LOAD_IMAGE_NODE || '11').split(',').map(s => s.trim()).filter(Boolean),
  ckptNode: ENV.COMFY_CKPT_NODE || '4',
  outputNode: ENV.COMFY_OUTPUT_NODE || '9',
  ckpt: ENV.COMFY_CKPT || ENV.IMAGE_MODEL || 'sd_xl_base_1.0.safetensors',
  steps: ENV.COMFY_STEPS ? Number(ENV.COMFY_STEPS) : null,
  cfg: ENV.COMFY_CFG ? Number(ENV.COMFY_CFG) : null,
  i2iDenoise: ENV.COMFY_I2I_DENOISE ? Number(ENV.COMFY_I2I_DENOISE) : 0.75,
  // i2i-mode node overrides — Qwen i2i uses different node IDs and a custom
  // TextEncodeQwenImageEdit node that takes "prompt" instead of "text".
  // Fall back to t2i nodes when not set.
  i2iPositiveNode: ENV.COMFY_I2I_POSITIVE_NODE || null,
  i2iPositiveInputKey: ENV.COMFY_I2I_POSITIVE_INPUT || 'text',
  i2iNegativeNode: ENV.COMFY_I2I_NEGATIVE_NODE || null,
  i2iSamplerNode: ENV.COMFY_I2I_SAMPLER_NODE || null,
  i2iOutputNode: ENV.COMFY_I2I_OUTPUT_NODE || null,
  // Set COMFY_CKPT_NODE=_none for GGUF workflows that have no CheckpointLoaderSimple.
  skipCkptNode: (ENV.COMFY_CKPT_NODE || '').toLowerCase() === '_none',
};

// Per-mode config for the 2-ref ImageStitch workflow (different node IDs from
// the single-ref i2i workflow). 'i2i-2refs' is the only special mode.
function comfyConfigForMode(mode) {
  if (mode === 'i2i-2refs') return {
    workflowPath: ENV.COMFY_2REF_WORKFLOW_PATH || null,
    positiveNode: ENV.COMFY_2REF_POSITIVE_NODE || '8',
    positiveInputKey: ENV.COMFY_2REF_POSITIVE_INPUT || 'prompt',
    negativeNode: ENV.COMFY_2REF_NEGATIVE_NODE || '10',
    samplerNode: ENV.COMFY_2REF_SAMPLER_NODE || '13',
    outputNode: ENV.COMFY_2REF_OUTPUT_NODE || '16',
    loadImageNodes: (ENV.COMFY_2REF_LOAD_IMAGE_NODES || '3,4').split(',').map(s => s.trim()).filter(Boolean),
  };
  return null;
}

// Values that appear in widgets_values after a seed/INT widget to mark the
// "control_after_generate" UI-only setting — not a real input, must be skipped.
const GRAPH_CTRL = new Set(['fixed', 'increment', 'decrement', 'randomize']);

/**
 * Convert a ComfyUI graph-format workflow (saved from the UI as {nodes, links, …})
 * into the API-submission format ({nodeId: {class_type, inputs}}).
 * Already-converted API-format objects (no .nodes array) are returned unchanged.
 */
function toApiFormat(raw) {
  if (!Array.isArray(raw.nodes)) return raw;
  const linkMap = new Map();
  for (const [id, srcNode, srcSlot] of (raw.links || [])) linkMap.set(id, [String(srcNode), srcSlot]);
  const api = {};
  for (const node of raw.nodes) {
    const inputs = {};
    const wv = node.widgets_values || [];
    let wi = 0;
    for (const inp of (node.inputs || [])) {
      if (inp.link != null) {
        const src = linkMap.get(inp.link);
        if (src) inputs[inp.name] = src;
      } else if (inp.widget) {
        if (inp.type === 'IMAGEUPLOAD') { wi++; continue; } // UI-only upload button
        inputs[inp.name] = wv[wi++];
        if (GRAPH_CTRL.has(wv[wi])) wi++; // skip control_after_generate after seed
      }
      // no widget + no link = optional unconnected input; skip
    }
    api[String(node.id)] = { class_type: node.type, inputs };
  }
  return api;
}

function loadComfyWorkflow(mode) {
  const modeCfg = comfyConfigForMode(mode);
  if (modeCfg?.workflowPath) { try { return toApiFormat(JSON.parse(readFileSync(modeCfg.workflowPath, 'utf8'))); } catch (e) { throw new Error(`workflow for mode ${mode} unreadable: ${e.message}`); } }
  const isI2I = mode === 'i2i' || mode === 'i2i-2refs';
  if (isI2I && ENV.COMFY_I2I_WORKFLOW_PATH) { try { return toApiFormat(JSON.parse(readFileSync(ENV.COMFY_I2I_WORKFLOW_PATH, 'utf8'))); } catch (e) { throw new Error(`COMFY_I2I_WORKFLOW_PATH unreadable: ${e.message}`); } }
  if (!isI2I && ENV.COMFY_WORKFLOW_PATH) { try { return toApiFormat(JSON.parse(readFileSync(ENV.COMFY_WORKFLOW_PATH, 'utf8'))); } catch (e) { throw new Error(`COMFY_WORKFLOW_PATH unreadable: ${e.message}`); } }
  return JSON.parse(JSON.stringify(isI2I ? DEFAULT_I2I_WORKFLOW : DEFAULT_T2I_WORKFLOW));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Stitch multiple reference images side-by-side into one PNG.
 * Uses sharp if available; falls back to returning the first ref (degraded mode).
 * This lets i2i-2refs work with the standard single-LoadImage Qwen workflow
 * without needing the ImageStitch custom node in ComfyUI.
 */
async function stitchRefs(refs) {
  if (refs.length <= 1) return refs[0];
  const s = await getSharp();
  if (!s) {
    console.warn('[comfy] sharp not available — i2i-2refs falling back to first ref only. Run npm install in server/ to fix.');
    return refs[0];
  }
  // Decode metadata, scale all to the same height, then composite side by side.
  const metas = await Promise.all(refs.map(r => s(r.bytes).metadata()));
  const maxH = Math.max(...metas.map(m => m.height || 512));
  const resized = await Promise.all(refs.map(async (r, i) => {
    const m = metas[i];
    const w = Math.round((m.width || 512) * maxH / (m.height || 512));
    const buf = await s(r.bytes).resize(w, maxH).png().toBuffer();
    return { buf, w };
  }));
  const totalW = resized.reduce((sum, r) => sum + r.w, 0);
  let xOffset = 0;
  const composites = resized.map(({ buf, w }) => {
    const c = { input: buf, top: 0, left: xOffset };
    xOffset += w;
    return c;
  });
  const stitched = await s({ create: { width: totalW, height: maxH, channels: 3, background: { r: 220, g: 220, b: 220 } } })
    .composite(composites)
    .png()
    .toBuffer();
  console.log(`[comfy] stitched ${refs.length} refs side-by-side → ${totalW}×${maxH}`);
  return { bytes: stitched, mime: 'image/png' };
}

// Upload a reference image buffer to ComfyUI's input folder. Returns the filename.
async function uploadRefToComfy(imageBytes, mime, signal) {
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
  const filename = `gink-ref-${randomUUID().slice(0, 8)}.${ext}`;
  const form = new FormData();
  form.append('image', new Blob([imageBytes], { type: mime }), filename);
  form.append('overwrite', 'true');
  const res = await fetch(`${URL}/upload/image`, { method: 'POST', signal, body: form });
  if (!res.ok) throw new Error(`ComfyUI /upload/image ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.name || filename;
}

async function callComfy(job) {
  if (!URL) throw new Error('IMAGE_SERVER_URL is not set (point it at your ComfyUI, e.g. http://localhost:8188)');

  const isI2IMode = job.mode === 'i2i' || job.mode === 'i2i-2refs';
  const useI2I = isI2IMode && job.refs?.length;
  // If mode is i2i/i2i-2refs but no refs are actually available (asset lost, etc.),
  // fall back to the t2i workflow so the LoadImage placeholder doesn't cause ComfyUI to fail.
  const effectiveWorkflowMode = useI2I ? (job.mode || 't2i') : 't2i';
  const wf = loadComfyWorkflow(effectiveWorkflowMode);
  const setNodeInput = (id, key, val) => { if (wf[id]?.inputs && val != null) wf[id].inputs[key] = val; };

  const clientId = ENV.COMFY_CLIENT_ID || `gink-${randomUUID().slice(0, 8)}`;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  // Resolve which node IDs and input keys to use for this mode.
  const modeCfg  = comfyConfigForMode(job.mode);
  const posNode  = modeCfg?.positiveNode  ?? (useI2I ? (COMFY.i2iPositiveNode || COMFY.positiveNode)  : COMFY.positiveNode);
  const posKey   = modeCfg?.positiveInputKey ?? (useI2I ? COMFY.i2iPositiveInputKey : 'text');
  const negNode  = modeCfg?.negativeNode  ?? (useI2I ? (COMFY.i2iNegativeNode || COMFY.negativeNode)  : COMFY.negativeNode);
  const sampNode = modeCfg?.samplerNode   ?? (useI2I ? (COMFY.i2iSamplerNode  || COMFY.samplerNode)   : COMFY.samplerNode);
  const outNode  = modeCfg?.outputNode    ?? (useI2I ? (COMFY.i2iOutputNode   || COMFY.outputNode)    : COMFY.outputNode);
  const loadNodes = modeCfg?.loadImageNodes ?? COMFY.loadImageNodes;

  // For i2i-2refs: when the workflow has 2 LoadImage nodes (ImageStitch is installed),
  // pass refs directly to separate nodes. When only 1 LoadImage node is configured,
  // stitch server-side so the combined image lands in that single node.
  let effectiveRefs = job.refs || [];
  if (job.mode === 'i2i-2refs' && effectiveRefs.length >= 2 && loadNodes.length < 2) {
    effectiveRefs = [await stitchRefs(effectiveRefs)];
  }

  try {
    // If i2i: upload every reference and wire each into a LoadImage node.
    // Round-robin if more refs than nodes; last uploaded ref fills any remaining nodes.
    if (useI2I) {
      const uploaded = [];
      for (const ref of effectiveRefs) uploaded.push(await uploadRefToComfy(ref.bytes, ref.mime, ctrl.signal));
      for (let i = 0; i < loadNodes.length; i++) {
        const filename = uploaded[i] || uploaded[uploaded.length - 1];
        if (filename) setNodeInput(loadNodes[i], 'image', filename);
      }
      setNodeInput(sampNode, 'denoise', COMFY.i2iDenoise);
    } else {
      setNodeInput(COMFY.sizeNode, 'width', job.width);
      setNodeInput(COMFY.sizeNode, 'height', job.height);
    }

    // COMFY_NEGATIVE_OVERRIDE: when set (even to empty string), replaces the computed
    // negative prompt. Use "" or "no text" for FLUX/Qwen — SD-style negative tags
    // hurt quality on these models because they're trained with empty negatives.
    const effectiveNeg = ENV.COMFY_NEGATIVE_OVERRIDE !== undefined ? ENV.COMFY_NEGATIVE_OVERRIDE : (job.negativePrompt || '');
    setNodeInput(posNode, posKey, job.prompt);
    setNodeInput(negNode, 'text', effectiveNeg);
    setNodeInput(sampNode, 'seed', job.seed);
    if (COMFY.steps) setNodeInput(sampNode, 'steps', COMFY.steps);
    if (COMFY.cfg)   setNodeInput(sampNode, 'cfg',   COMFY.cfg);
    if (!COMFY.skipCkptNode) setNodeInput(COMFY.ckptNode, 'ckpt_name', job.model || COMFY.ckpt);

    // ── debug: log exactly what we're sending ──────────────────────────────
    const wfClasses = Object.entries(wf).map(([id, n]) => `${id}:${n.class_type}`).join(' ');
    console.log(`[comfy] mode=${job.mode} size=${job.width}x${job.height} seed=${job.seed}`);
    console.log(`[comfy]   nodes → pos=${posNode}(${posKey}) neg=${negNode} sampler=${sampNode} out=${outNode}`);
    console.log(`[comfy]   workflow: ${wfClasses}`);
    console.log(`[comfy]   prompt: ${String(job.prompt || '').slice(0, 200)}`);
    if (job.negativePrompt) console.log(`[comfy]   negative: ${String(job.negativePrompt).slice(0, 120)}`);
    if (useI2I) console.log(`[comfy]   refs uploaded → LoadImage nodes: ${loadNodes.join(', ')}`);
    // ────────────────────────────────────────────────────────────────────────

    const queued = await fetch(`${URL}/prompt`, { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: clientId }) });
    if (!queued.ok) throw new Error(`ComfyUI /prompt ${queued.status}: ${(await queued.text()).slice(0, 800)}`);
    const { prompt_id: promptId, error } = await queued.json();
    if (error || !promptId) throw new Error(`ComfyUI rejected the workflow: ${JSON.stringify(error || 'no prompt_id')}`);

    let outputs = null;
    for (let i = 0; i < Math.ceil(TIMEOUT / 1500); i++) {
      await sleep(1500);
      const h = await fetch(`${URL}/history/${promptId}`, { signal: ctrl.signal });
      if (!h.ok) continue;
      const hist = await h.json();
      const entry = hist[promptId];
      if (entry) { if (entry.status?.status_str === 'error') throw new Error(`ComfyUI run failed: ${JSON.stringify(entry.status.messages || []).slice(0, 800)}`); if (entry.outputs) { outputs = entry.outputs; break; } }
    }
    if (!outputs) throw new Error('ComfyUI timed out waiting for the render');
    const out = outputs[outNode] || Object.values(outputs).find(o => o.images?.length);
    const img = out?.images?.[0];
    if (!img) throw new Error('ComfyUI produced no image (check COMFY_OUTPUT_NODE / your SaveImage node id)');
    const view = await fetch(`${URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`, { signal: ctrl.signal });
    if (!view.ok) throw new Error(`ComfyUI /view ${view.status}`);
    return { bytes: Buffer.from(await view.arrayBuffer()), mime: view.headers.get('content-type') || 'image/png', width: job.width, height: job.height };
  } finally { clearTimeout(t); }
}

// ─── public ──────────────────────────────────────────────────────────────────

/**
 * generateImage(job) -> { bytes, mime, width, height, model, seed, backend }
 * job: { prompt, negativePrompt, model, seed, mode:'t2i'|'i2i', width, height, label, refs:[{bytes,mime}] }
 */
export async function generateImage(job) {
  const width = job.width || 720, height = job.height || 1280;
  const seed = job.seed ?? Math.floor(Math.random() * 1e9);
  if (TYPE === 'placeholder') return { bytes: Buffer.from(placeholderSvg({ prompt: job.prompt, label: job.label || 'panel', width, height }), 'utf8'), mime: 'image/svg+xml', width, height, model: 'placeholder', seed, backend: 'placeholder' };
  if (TYPE === 'comfyui') {
    const out = await callComfy({ ...job, width, height, seed });
    // Use mode-specific label when no explicit model is requested, so the UI shows the
    // actual GGUF name rather than the SDXL fallback string.
    const modeLabel = (job.mode === 'i2i' || job.mode === 'i2i-2refs')
      ? (ENV.COMFY_I2I_MODEL || ENV.COMFY_CKPT || 'qwen-image-edit-Q4_0.gguf')
      : (ENV.COMFY_CKPT || 'qwen-image-Q4_0.gguf');
    return { ...out, model: job.model || modeLabel, seed, backend: 'comfyui' };
  }
  // generic http
  const payload = { prompt: job.prompt, negativePrompt: job.negativePrompt || '', model: job.model || ENV.IMAGE_MODEL || 'sdxl', seed, mode: job.mode || 't2i', width, height, referenceImages: (job.refs || []).map(r => ({ base64: Buffer.from(r.bytes).toString('base64'), mime: r.mime })) };
  const out = await callHttp(payload);
  return { ...out, model: payload.model, seed, backend: TYPE };
}
