// ai/shots.js — deterministic camera-shot detection.
//
// A storyboard's visual note almost always names the framing in plain words:
//   "Two-shot capturing Kinji…"  →  two-shot
//   "Close-up on the manila folder…"  →  close-up
//   "Wide establishing shot of a cramped apartment…"  →  establishing shot
//   "Low angle shot looking up at Kinji…"  →  low angle shot
//
// detectCameraShot() turns that text into one of CAMERA_SHOTS, or '' if it
// genuinely can't tell. Used by the ingest parser (at parse time) and by the
// Pages stage (to fill any panel that still has a blank shot). No LLM involved.

import { CAMERA_SHOTS, isCameraShot } from '../docSchema.js';

// longest / most specific names first so "medium close-up" wins over "medium shot",
// "extreme close-up" wins over "close-up", etc.
const ORDERED = [...CAMERA_SHOTS].sort((a, b) => b.length - a.length);

// extra phrasings the literal-name scan won't catch
const PATTERNS = [
  [/extreme close-?up|iris shot|pupil|eye reflect/i, 'extreme close-up'],
  [/over[- ]the[- ]shoulder|over .{0,12}shoulder|ots\b/i, 'over-the-shoulder shot'],
  [/bird'?s[- ]?eye|top[- ]down view|overhead shot/i, "bird's-eye view"],
  [/establishing shot|wide establishing|exterior wide/i, 'establishing shot'],
  [/two[- ]?shot|both men|two figures|the two of them/i, 'two-shot'],
  [/medium close-?up|mcu\b/i, 'medium close-up'],
  [/low[- ]angle|looking up at|worm'?s[- ]?eye/i, 'low angle shot'],
  [/high[- ]angle|looking down at|from above/i, 'high angle shot'],
  [/cowboy shot|american shot|mid[- ]thigh/i, 'cowboy shot'],
  [/\bclose-?up\b|\bcloseup\b|tight on\b/i, 'close-up'],
  [/\bwide shot\b|\bwide angle\b|cityscape|street level|exterior/i, 'wide shot'],
  [/\bmedium shot\b|waist[- ]up|mid[- ]shot/i, 'medium shot'],
];

/**
 * detectCameraShot(text [, fallback]) → a value from CAMERA_SHOTS, or `fallback`.
 * `text` is whatever describes the framing — usually the panel's `visual` field,
 * optionally with the ingest's "[Medium / … / …]" header tokens appended.
 */
export function detectCameraShot(text, fallback = '') {
  const t = String(text || '').toLowerCase();
  if (!t.trim()) return isCameraShot(fallback) ? fallback : '';
  // 1. literal shot name present in the text
  for (const name of ORDERED) {
    const needle = name.replace(/[''`]/g, '');
    if (t.includes(needle)) return name;
  }
  // 2. known phrasings
  for (const [re, shot] of PATTERNS) if (re.test(t)) return shot;
  // 3. nothing recognisable
  return isCameraShot(fallback) ? fallback : '';
}

/** Coerce an arbitrary stored value to a valid camera shot ('' if unrecognisable). */
export function normalizeCameraShot(value) {
  if (isCameraShot(value)) return value || '';
  const v = String(value || '').trim().toLowerCase();
  const exact = CAMERA_SHOTS.find(s => s === v);
  if (exact) return exact;
  // map common ingest junk ("Action Shot", "Reaction Shot", "Medium", …)
  return detectCameraShot(v, '');
}
