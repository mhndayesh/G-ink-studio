// ai/rules.js — the layered prompt-rule engine.
//
// Three layers, lowest first:
//   1. SYSTEM layer  — doc.systemRule.{positive,negative}. Always present on every
//      image prompt. Editable in the UI ("Global Style"). Factory default lives in
//      docSchema.newProjectDoc(); from then on it is owned by the project document.
//   2. STAGE/ENTITY rule — server/rules/{panel,character,location,lettering}.json.
//      A template + llmInstructions + maxLength. Loaded & validated once at startup;
//      a malformed rule file aborts the server (no silent fallback).
//   3. PER-ITEM overrides — imagePromptLocked (AI never touches), promptAddon /
//      negativeAddon (extra tags appended last), and doc.ruleOverrides[kind].
//
// compilePrompt() is deterministic (zero LLM calls) and ALWAYS yields a flat
// comma-separated tag list — never prose. The LLM path (in director.js) only
// *upgrades* the deterministic result and is post-processed back into a tag list
// by cleanPromptText(), so even a misbehaving model can't produce a poem.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RULES_DIR = join(__dirname, '..', '..', 'rules');

const RULE_KINDS = ['panel', 'character', 'location', 'lettering'];

function loadRuleFile(kind) {
  let raw;
  try { raw = readFileSync(join(RULES_DIR, `${kind}.json`), 'utf8'); }
  catch (e) { throw new Error(`Rule file rules/${kind}.json is missing or unreadable: ${e.message}`); }
  let r;
  try { r = JSON.parse(raw); }
  catch (e) { throw new Error(`Rule file rules/${kind}.json is not valid JSON: ${e.message}`); }
  if (r.kind !== kind) throw new Error(`Rule file rules/${kind}.json has kind="${r.kind}", expected "${kind}"`);
  if (!r.id || !r.name) throw new Error(`Rule file rules/${kind}.json must have an id and a name`);
  if (kind !== 'lettering') {
    if (typeof r.template !== 'string' || !r.template.includes('{{')) throw new Error(`Rule file rules/${kind}.json must have a {{token}} template`);
    if (typeof r.maxLength !== 'number' || r.maxLength < 40) throw new Error(`Rule file rules/${kind}.json must have a sane numeric maxLength`);
    if (typeof r.llmInstructions !== 'string' || r.llmInstructions.length < 20) throw new Error(`Rule file rules/${kind}.json must have llmInstructions`);
  }
  if (kind === 'panel') {
    for (const m of ['t2i', 'i2i', 'i2i-2refs']) {
      if (typeof r.templates?.[m] !== 'string' || !r.templates[m].includes('{{')) throw new Error(`Rule file rules/panel.json must have a {{token}} templates.${m}`);
    }
  }
  return r;
}

const RULES = Object.fromEntries(RULE_KINDS.map(k => [k, loadRuleFile(k)]));

/** The active rule for a kind = file rule merged with the project's optional overrides. */
export function getRule(kind, doc) {
  const base = RULES[kind];
  if (!base) throw new Error(`Unknown rule kind: ${kind}`);
  const ov = doc?.ruleOverrides?.[kind];
  return ov ? { ...base, ...ov } : base;
}

export function allRules(doc) {
  return Object.fromEntries(RULE_KINDS.map(k => [k, getRule(k, doc)]));
}

// ─── tag-list hygiene ────────────────────────────────────────────────────────

/** Split arbitrary text into a clean, deduped, length-bounded comma-separated tag list. */
export function cleanPromptText(text, maxLength = 360) {
  if (!text) return '';
  let s = String(text)
    .replace(/```[\s\S]*?```/g, ' ')          // strip code fences
    .replace(/^\s*(prompt|positive|output)\s*[:\-]\s*/i, '')
    .replace(/[\r\n]+/g, ', ')                  // newlines -> separators
    .replace(/[""'`]/g, '')                     // stray quotes
    .replace(/\s*\.\s*$/, '');                  // trailing period
  const seen = new Set();
  const tags = [];
  for (let t of s.split(/[,;]+/)) {
    t = t.replace(/\s+/g, ' ').trim().replace(/^[.\-•]+\s*/, '');
    if (!t) continue;
    // drop obvious prose: a long fragment that is really a sentence
    if (t.split(' ').length > 14) t = t.split(' ').slice(0, 14).join(' ');
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(t);
  }
  let out = tags.join(', ');
  if (out.length > maxLength) {
    // truncate at a comma boundary
    out = out.slice(0, maxLength);
    const i = out.lastIndexOf(',');
    if (i > maxLength * 0.6) out = out.slice(0, i);
    out = out.trim().replace(/,\s*$/, '');
  }
  return out;
}

function fillTemplate(template, tokens) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => (tokens[k] != null ? String(tokens[k]) : ''));
}

// ─── deterministic compilation ───────────────────────────────────────────────

/**
 * compilePrompt(kind, ctx, doc) -> { prompt, negativePrompt, ruleId }
 * ctx fields used per kind:
 *   panel:     { visual, action, characters (string), cameraShot, location, mood, hasLettering, negativeAddon, promptAddon }
 *   character: { appearance, outfit, props, negativeAddon, promptAddon }
 *   location:  { appearance, lighting, mood, negativeAddon, promptAddon }
 */
export function compilePrompt(kind, ctx = {}, doc) {
  const rule = getRule(kind, doc);
  const sys = doc?.systemRule?.positive || 'manga style, black and white';
  const tokens = { ...ctx, system: sys };
  if (kind === 'panel') tokens.letteringClause = ctx.hasLettering ? (rule.letteringClause || '') : '';
  let prompt = fillTemplate(rule.template, tokens);
  // append per-item addon last, then clean
  if (ctx.promptAddon) prompt += ', ' + ctx.promptAddon;
  prompt = cleanPromptText(prompt, rule.maxLength);
  // guarantee the system tags survive truncation / weird input
  const sysClean = cleanPromptText(sys, 9999);
  if (!prompt.toLowerCase().startsWith(sysClean.toLowerCase().slice(0, 16))) {
    prompt = cleanPromptText(sysClean + ', ' + prompt, rule.maxLength);
  }
  const negParts = [doc?.systemRule?.negative, rule.negative, ctx.negativeAddon].filter(Boolean);
  const negativePrompt = cleanPromptText(negParts.join(', '), 600);
  return { prompt, negativePrompt, ruleId: rule.id };
}

// ─── LLM instruction blocks ──────────────────────────────────────────────────

export function llmInstructionsFor(kind, doc) {
  const rule = getRule(kind, doc);
  const sys = doc?.systemRule?.positive || 'manga style, black and white';
  const filled = fillTemplate(rule.llmInstructions || '', { maxLength: rule.maxLength });
  return [
    filled,
    ``,
    `The exact system tags you MUST start with: "${cleanPromptText(sys, 9999)}"`,
    `Hard rules: output is a single comma-separated tag list, no sentences, no paragraphs, no poetry, no markdown, no quotes, no labels. Never invent details that are not in the brief.`,
  ].join('\n');
}

/** Post-process a raw LLM prompt back into a guaranteed-clean tag list with the system tags in front. */
export function finalizeLLMPrompt(kind, rawText, doc, { promptAddon, negativeAddon } = {}) {
  const rule = getRule(kind, doc);
  const sys = cleanPromptText(doc?.systemRule?.positive || 'manga style, black and white', 9999);
  let body = cleanPromptText(rawText, rule.maxLength);
  if (!body.toLowerCase().startsWith(sys.toLowerCase().slice(0, 16))) body = cleanPromptText(sys + ', ' + body, rule.maxLength);
  if (promptAddon) body = cleanPromptText(body + ', ' + promptAddon, rule.maxLength);
  const negParts = [doc?.systemRule?.negative, rule.negative, negativeAddon].filter(Boolean);
  return { prompt: body, negativePrompt: cleanPromptText(negParts.join(', '), 600), ruleId: rule.id };
}

// ─── panel prompt: deterministic assembly, render-mode aware ─────────────────
//
// A panel prompt is never written by an LLM. It is assembled from pieces that
// already exist as reviewed values:
//   t2i        → comma-separated tags : system + each character's visual tags +
//                action + camera shot + location's visual tags + mood-as-lighting
//   i2i        → a short natural-language edit instruction for the Qwen Image
//                Edit model. The reference image carries the character's look,
//                so the text only describes the SCENE around them and the framing.
//   i2i-2refs  → same, referencing both stitched reference images.

const byId2 = (arr, id) => (arr || []).find(x => x.id === id) || null;

/** Drop the leading system-style tokens from an already-compiled entity prompt. */
function stripSystemPrefix(text, doc) {
  const sys = cleanPromptText(doc?.systemRule?.positive || '', 9999);
  if (!sys) return cleanPromptText(text, 9999);
  const sysTags = sys.toLowerCase().split(',').map(t => t.trim());
  const tags = cleanPromptText(text, 9999).split(',').map(t => t.trim());
  let i = 0;
  while (i < tags.length && sysTags.includes(tags[i].toLowerCase())) i++;
  return tags.slice(i).join(', ').trim();
}

/** Collapse arbitrary text into a single clean sentence-ish instruction (no markdown, no stray quotes; keeps apostrophes). */
function cleanInstruction(text, maxLength = 600) {
  let s = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[*_`#>]+/g, '')
    .replace(/[""""„«»]/g, '')              // drop double/smart quotes…
    .replace(/[''‚]/g, "'")                 // …but normalise smart single quotes to a plain apostrophe
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/([.,;:!?]){2,}/g, '$1')
    .replace(/\.\s*\./g, '.')
    .trim();
  if (s && !/[.!?]$/.test(s)) s += '.';
  if (s.length > maxLength) { s = s.slice(0, maxLength); const i = s.lastIndexOf('.'); if (i > maxLength * 0.5) s = s.slice(0, i + 1); else s = s.trim() + '…'; }
  return s;
}

/**
 * Resolve a panel's *effective* render mode — i.e. what the renderer will actually do.
 * i2i / i2i-2refs require at least one reference image to be available; with no refs
 * (even if the panel says renderMode:'i2i') the render falls back to t2i, so the prompt
 * must be a t2i prompt too. 'auto' → i2i-2refs with ≥2 referenced characters, i2i with one.
 */
export function resolvePanelMode(doc, panel) {
  const refChars = (panel?.characters || []).filter(cid => (byId2(doc?.characters, cid)?.refs || []).length);
  const locHasRef = !!(panel?.locationId && (byId2(doc?.locations, panel.locationId)?.refs || []).length);
  const haveRefs = refChars.length > 0 || locHasRef;
  const m = panel?.renderMode;
  if (m === 't2i') return 't2i';
  if (!haveRefs) return 't2i';
  if (m === 'i2i-2refs') return 'i2i-2refs';
  if (m === 'i2i') return 'i2i';
  return refChars.length >= 2 ? 'i2i-2refs' : 'i2i';
}

/**
 * compilePanelPrompt(doc, panel, { moodLighting }) → { prompt, negativePrompt, mode, ruleId }
 * `moodLighting` (optional): pre-translated lighting/atmosphere tags for the panel's mood.
 * If absent, the panel's raw `mood` prose is used as a (weaker) fallback.
 */
export function compilePanelPrompt(doc, panel, { moodLighting } = {}) {
  const rule = getRule('panel', doc);
  const mode = resolvePanelMode(doc, panel);
  const sys = cleanPromptText(doc?.systemRule?.positive || 'manga style, black and white', 9999);
  const hasLettering = !!((panel.dialogue && panel.dialogue.trim()) || (panel.narration && panel.narration.trim()));
  const moodText = (moodLighting && moodLighting.trim()) ? moodLighting.trim() : (panel.mood || '');

  // entity pieces
  const charPrompts = (panel.characters || []).map(cid => byId2(doc?.characters, cid)).filter(Boolean);
  const loc = byId2(doc?.locations, panel.locationId);

  const negParts = [doc?.systemRule?.negative, rule.negative, panel.negativeAddon,
    ...charPrompts.map(c => c.negativeAddon)].filter(Boolean);
  const negativePrompt = cleanPromptText(negParts.join(', '), 600);

  if (mode === 't2i') {
    const charTags = charPrompts.map(c => (c.imagePrompt ? stripSystemPrefix(c.imagePrompt, doc) : c.name)).filter(Boolean).join(', ');
    const locTags  = loc ? (loc.imagePrompt ? stripSystemPrefix(loc.imagePrompt, doc) : [loc.name, loc.type].filter(Boolean).join(', ')) : '';
    const tokens = {
      system: sys,
      characters: charTags,
      action: cleanPromptText(panel.action || panel.pose || '', 120),
      cameraShot: panel.cameraShot || '',
      location: cleanPromptText(locTags, 160),
      mood: cleanPromptText(moodText, 120),
      letteringClauseComma: hasLettering ? `, ${rule.letteringClause || ''}` : '',
    };
    let prompt = fillTemplate(rule.templates.t2i, tokens);
    if (panel.promptAddon) prompt += ', ' + panel.promptAddon;
    prompt = cleanPromptText(prompt, rule.maxLength);
    if (!prompt.toLowerCase().startsWith(sys.toLowerCase().slice(0, 16))) prompt = cleanPromptText(sys + ', ' + prompt, rule.maxLength);
    return { prompt, negativePrompt, mode, ruleId: rule.id };
  }

  // i2i / i2i-2refs — natural-language edit instruction
  const max = rule.maxLengthI2I || 600;
  const locPhrase = loc
    ? [loc.name, loc.description ? String(loc.description).replace(/\s+/g, ' ').split(/(?<=[.!?])\s/)[0].slice(0, 120) : (loc.type || '')].filter(Boolean).join(' — ')
    : 'the same setting as the previous panel';
  // which characters are carried by the reference image(s) vs. merely present in the scene
  const refChars   = charPrompts.filter(c => (c.refs || []).length);
  const carried    = mode === 'i2i-2refs' ? refChars.slice(0, 2) : (refChars[0] ? [refChars[0]] : charPrompts.slice(0, 1));
  const carriedIds = new Set(carried.map(c => c.id));
  const others     = charPrompts.filter(c => !carriedIds.has(c.id)).map(c => c.name);
  const refCharacter = carried.length ? carried.map(c => c.name).join(' and ') : (charPrompts[0]?.name || 'the character');
  const action = cleanInstruction(panel.action || panel.pose || `${refCharacter} in frame`, 220);
  const moodClause = moodText ? ` Lighting and atmosphere: ${cleanInstruction(moodText, 120).replace(/\.$/, '')}.` : '';
  const tokens = {
    system: cleanInstruction(sys, 200).replace(/\.$/, ''),
    location: locPhrase,
    action,
    cameraShot: panel.cameraShot || 'a balanced',
    refCharacter,
    refPronoun: carried.length > 1 ? 'them' : 'them',                       // keep it simple & gender-neutral
    otherCharsClause: others.length ? ` Also present: ${others.join(' and ')}.` : '',
    moodClause,
    letteringSentence: hasLettering ? (rule.letteringSentence || '') : '',
  };
  let prompt = fillTemplate(rule.templates[mode] || rule.templates.i2i, tokens);
  if (panel.promptAddon) prompt += ' ' + panel.promptAddon;
  prompt = cleanInstruction(prompt, max);
  return { prompt, negativePrompt, mode, ruleId: rule.id };
}

export { RULE_KINDS };
