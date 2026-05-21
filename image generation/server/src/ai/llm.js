// ai/llm.js — one tiny abstraction over three LLM backends:
//   - anthropic  (ANTHROPIC_API_KEY)         — cloud, fast (claude-haiku class)
//   - openai     (OPENAI_API_KEY)             — cloud, fast (gpt-4o-mini class)
//   - lmstudio   (LLM_BASE_URL, OpenAI-compatible) — local LM Studio / Ollama
//   - off        — no LLM; the deterministic compiler is used everywhere
//
// Selection: AI_PROVIDER env (or doc.aiSettings.provider) — 'auto' picks the first
// configured of [anthropic, openai, lmstudio], else 'off'. Everything in the app
// works with 'off'; the LLM only upgrades the deterministic output.

const ENV = process.env;
const TIMEOUT = Number(ENV.LLM_TIMEOUT_MS || 45000);

function resolveProvider(pref) {
  const p = (pref || ENV.AI_PROVIDER || 'auto').toLowerCase();
  if (p === 'anthropic' || p === 'openai' || p === 'lmstudio' || p === 'off') return p;
  // auto
  if (ENV.ANTHROPIC_API_KEY) return 'anthropic';
  if (ENV.OPENAI_API_KEY) return 'openai';
  if (ENV.LLM_BASE_URL) return 'lmstudio';
  return 'off';
}

function modelFor(provider, override) {
  if (override) return override;
  if (provider === 'anthropic') return ENV.LLM_MODEL || 'claude-haiku-4-5';
  if (provider === 'openai') return ENV.LLM_MODEL || 'gpt-4o-mini';
  if (provider === 'lmstudio') return ENV.LLM_MODEL || '';   // '' = let the server use whatever is loaded
  return '';
}

export function llmStatus(doc) {
  const provider = resolveProvider(doc?.aiSettings?.provider);
  const model = modelFor(provider, doc?.aiSettings?.model);
  const labels = { anthropic: 'Claude (cloud)', openai: 'OpenAI (cloud)', lmstudio: 'LM Studio (local)', off: 'No LLM — deterministic only' };
  return { provider, model, configured: provider !== 'off', label: labels[provider] };
}

async function withTimeout(promise, ms, label) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await promise(ctrl.signal); }
  finally { clearTimeout(t); }
}

async function callAnthropic({ system, user, model, maxTokens, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': ENV.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

async function callOpenAICompatible({ baseUrl, apiKey, system, user, model, maxTokens, signal }) {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    body: JSON.stringify({ model: model || undefined, max_tokens: maxTokens, temperature: 0.3, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

/** Low-level chat. Returns the assistant text. Throws on any failure (callers fall back to deterministic). */
export async function chat({ system = 'You are a precise assistant.', user, maxTokens = 700, doc, model: modelOverride } = {}) {
  const provider = resolveProvider(doc?.aiSettings?.provider);
  if (provider === 'off') throw new Error('No LLM configured');
  const model = modelFor(provider, modelOverride || doc?.aiSettings?.model);
  return withTimeout(signal => {
    if (provider === 'anthropic') return callAnthropic({ system, user, model, maxTokens, signal });
    if (provider === 'openai') return callOpenAICompatible({ baseUrl: 'https://api.openai.com/v1', apiKey: ENV.OPENAI_API_KEY, system, user, model, maxTokens, signal });
    return callOpenAICompatible({ baseUrl: ENV.LLM_BASE_URL || 'http://localhost:1234/v1', apiKey: ENV.LLM_API_KEY || 'lmstudio', system, user, model, maxTokens, signal });
  }, TIMEOUT);
}

/** Chat that must return JSON. Tolerates ```json fences and leading/trailing prose. */
export async function chatJson({ system, user, maxTokens = 1400, doc } = {}) {
  const text = await chat({ system: (system || '') + '\nRespond with ONLY a JSON value, no prose, no markdown fences.', user, maxTokens, doc });
  return parseLooseJson(text);
}

export function parseLooseJson(text) {
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // grab the outermost {...} or [...]
  const first = s.search(/[[{]/);
  if (first > 0) s = s.slice(first);
  const lastObj = s.lastIndexOf('}'); const lastArr = s.lastIndexOf(']');
  const last = Math.max(lastObj, lastArr);
  if (last >= 0) s = s.slice(0, last + 1);
  return JSON.parse(s);
}

/** Quick health probe used by the UI. Never throws. */
export async function probeLLM(doc) {
  const st = llmStatus(doc);
  if (!st.configured) return { ...st, ok: false, detail: 'No provider configured — using deterministic compilation.' };
  try {
    const r = await chat({ user: 'Reply with the single word: ok', maxTokens: 5, doc });
    return { ...st, ok: /ok/i.test(r), detail: r.slice(0, 80) };
  } catch (e) { return { ...st, ok: false, detail: String(e.message).slice(0, 160) }; }
}
