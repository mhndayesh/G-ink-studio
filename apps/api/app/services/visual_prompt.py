from __future__ import annotations

"""Canonical visual-prompt policy for the Manga Maker.

Every AI image prompt this project produces — character sheets, location sheets,
faction signatures, per-panel prompts — must be:

  1. **Short and literal.** A comma-separated list of things that are *drawn*.
     No prose, no poetry, no mood-writing, no "cinematic"/"noir"/"atmospheric",
     no render directives ("8k", "depth of field"), no lighting *colour*.
  2. **Black and white.** The project renders monochrome Japanese manga, so
     colour names are stripped (a B&W model ignores or fights them). Describe
     light/shadow in value terms instead ("deep shadows", "high contrast").
  3. **Prefixed with one fixed style tag** — ``STYLE_PREFIX`` — added here, not
     repeated per entity (repeating it wastes tokens and risks "anime style" vs
     "manga style" contradictions).

Use :func:`compile_visual_prompt` whenever a final prompt string is assembled,
and :func:`sanitize_visual_prompt` to clean a single free-text fragment. Inject
:data:`STYLE_INSTRUCTION` into LLM schemas so the model is *told* to emit clean,
short, visual-only text in the first place.
"""

import re

# The one fixed style tag prepended to every compiled prompt. Do not repeat it
# inside individual fragments — compile_visual_prompt adds it exactly once.
STYLE_PREFIX = "black and white Japanese manga style"

# Hand this to the LLM in prompt schemas (e.g. the `positive_prompt` field spec)
# so generations come back clean instead of needing heavy sanitising.
STYLE_INSTRUCTION = (
    "Write a SHORT comma-separated list of things that are visibly drawn — no full "
    "sentences, no mood/poetry, no story significance. Do NOT include colour names "
    "(this project renders black and white — use light/shadow words like 'deep "
    "shadows', 'high contrast' instead), no lighting/colour directives, no "
    "'cinematic'/'noir'/'atmospheric'/'masterpiece'/'8k'/'bokeh'/'depth of field', "
    "and no style word (the system prepends 'black and white Japanese manga style' "
    "automatically). For a character: only the visible person — build/age, face, "
    "hair, eyes, signature outfit, iconic prop — never a scene, pose, or setting."
)

# Standard negatives appended to every negative prompt (B&W manga target).
NEGATIVE_BASE = (
    "color, colour, coloured, watercolor, oil painting, 3d render, cgi, "
    "photorealistic, photograph, realistic photo, blurry, lowres, low quality, "
    "jpeg artifacts, text, watermark, signature, logo, extra limbs, extra fingers, "
    "deformed, mutated, bad anatomy, nsfw"
)

# --- token blacklists ------------------------------------------------------

# Colour words (and obvious colour modifiers) — any fragment containing one is
# dropped. "_" suffix on a few keeps "blacksmith"/"greenhouse" etc. from matching
# (we match on word boundaries below, so plain words are fine).
_COLOUR_WORDS = {
    "red", "crimson", "scarlet", "maroon", "burgundy", "ruby",
    "orange", "amber", "tangerine", "rust", "ochre", "ginger",
    "yellow", "gold", "golden", "blonde", "blond", "honey", "mustard",
    "green", "emerald", "olive", "lime", "jade", "mint", "teal",
    "blue", "azure", "cobalt", "navy", "indigo", "sapphire", "cyan", "turquoise",
    "purple", "violet", "lavender", "lilac", "magenta", "mauve", "plum",
    "pink", "rose", "salmon", "fuchsia", "coral",
    "brown", "tan", "beige", "bronze", "copper", "chestnut", "auburn", "sepia",
    "white", "ivory", "cream", "pearl", "snow",
    "black", "ebony", "jet", "onyx", "charcoal",
    "grey", "gray", "silver", "ash", "slate", "gunmetal", "steel",
    "colorful", "colourful", "multicolored", "multicoloured", "pastel",
    "neon", "vibrant colors", "vibrant colours", "color palette", "colour palette",
    "desaturated", "saturated", "hue", "hues", "tinted", "tinge", "tinged",
}

# Render/quality/mood directives that don't help (or hurt) a manga line-art model.
_BANNED_SUBSTRINGS = (
    "cinematic", "noir", "atmospher", "ambience", "ambiance", "lighting",
    "volumetric", "god rays", "lens flare", "bokeh",
    "depth of field", "shallow focus", "8k", "4k", "uhd", "hdr", "octane",
    "unreal engine", "trending on artstation", "masterpiece", "best quality",
    "ultra detailed", "hyperdetailed", "highly detailed", "intricate detail",
    "photorealistic", "photo realistic", "realistic", "cel shading", "cel-shaded",
    "anime style", "manga style", "manga art style", "comic book style",
    "art style", "illustration style", "concept art", "digital painting",
    "studio lighting", "color grading", "colour grading", "color scheme",
    "colour scheme", "vivid colors", "vivid colours", "dynamic lighting",
)

# Whole fragments to drop if they're *only* about lighting/atmosphere/composition.
_DROP_IF_PHRASE_STARTS_WITH = (
    "lighting", "atmosphere", "atmospheric", "mood", "ambience", "composition",
    "color", "colour", "palette", "tone", "tones", "vibe", "feel", "aesthetic",
    "style", "render", "rendered", "rendering",
)

# Drop any fragment that contains one of these as a whole word (it's render /
# lighting / mood / colour talk, not something concretely drawn).
_DROP_IF_CONTAINS_WORD = frozenset({
    "lighting", "lit", "atmosphere", "atmospheric", "ambience", "ambiance",
    "composition", "palette", "vibe", "aesthetic", "render", "rendered",
    "rendering", "shading", "tone", "tones", "toned", "colored", "coloured",
})

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]*")
_SPLIT_RE = re.compile(r"[,;\n.|]+|\s+and\s+|\s+with\s+")
_MAX_PHRASES = 36
_MAX_CHARS = 320

# Filler words a colour-stripped phrase can be left as — if that's all that
# remains, the phrase carried no real visual content.
_FILLER_ONLY = {
    "a", "an", "the", "of", "in", "on", "and", "with", "very", "deep", "dark",
    "light", "pale", "bright", "soft", "warm", "cold", "tone", "tones",
}


def _clean_phrase(phrase: str) -> str:
    """Return a cleaned phrase, or "" if it should be dropped entirely.

    Drops phrases carrying render/quality/style/lighting noise; for everything
    else, strips colour words word-by-word (keeping the rest) and drops phrases
    that are only lighting/atmosphere/composition talk or only filler afterwards.
    """
    p = " ".join(phrase.split())
    low = p.lower()
    if not p or len(p) < 2:
        return ""
    if any(b in low for b in _BANNED_SUBSTRINGS):
        return ""
    low_words = {w.lower() for w in _WORD_RE.findall(low)}
    if low_words & _DROP_IF_CONTAINS_WORD:
        return ""
    first_word = _WORD_RE.match(low)
    if first_word and first_word.group(0) in _DROP_IF_PHRASE_STARTS_WITH:
        return ""
    # strip colour words but keep the rest of the phrase
    kept_tokens = [tok for tok in p.split() if tok.strip(".,;:'\"()").lower() not in _COLOUR_WORDS]
    cleaned = " ".join(kept_tokens).strip(" -,")
    if not cleaned:
        return ""
    words = [w.lower() for w in _WORD_RE.findall(cleaned)]
    if not words or all(w in _FILLER_ONLY for w in words):
        return ""
    return cleaned


def sanitize_visual_prompt(text: object) -> str:
    """Reduce a free-text visual fragment to a short, literal, B&W-safe phrase list.

    Splits on commas / semicolons / line breaks / sentence stops / "and"/"with",
    drops phrases that carry colour, lighting, render-quality or style noise,
    de-duplicates (case-insensitively, order-preserving) and caps the length.
    Returns "" when nothing usable survives.
    """
    if not text:
        return ""
    raw = str(text).strip()
    if not raw:
        return ""
    out: list[str] = []
    seen: set[str] = set()
    for chunk in _SPLIT_RE.split(raw):
        phrase = _clean_phrase(chunk or "")
        if not phrase:
            continue
        key = phrase.lower()
        if key in seen or key == STYLE_PREFIX:
            continue
        seen.add(key)
        out.append(phrase)
        if len(out) >= _MAX_PHRASES:
            break
    joined = ", ".join(out)
    if len(joined) > _MAX_CHARS:
        joined = joined[:_MAX_CHARS].rsplit(",", 1)[0].strip()
    return joined


def compile_visual_prompt(*parts: object) -> str:
    """Join visual fragments into one final prompt, prefixed with ``STYLE_PREFIX``.

    Each part is sanitised; empties are dropped; duplicates across parts are
    removed. The result always starts with exactly one ``STYLE_PREFIX``. If no
    part has usable content the prefix alone is returned.
    """
    seen: set[str] = set()
    kept: list[str] = []
    for part in parts:
        cleaned = sanitize_visual_prompt(part)
        if not cleaned:
            continue
        for phrase in cleaned.split(", "):
            key = phrase.lower()
            if not key or key in seen or key == STYLE_PREFIX:
                continue
            seen.add(key)
            kept.append(phrase)
    body = ", ".join(kept)
    return f"{STYLE_PREFIX}, {body}" if body else STYLE_PREFIX


def negative_prompt(extra: object = "") -> str:
    """Standard B&W-manga negative terms, optionally extended with a sanitised extra."""
    cleaned = sanitize_visual_prompt(extra)
    return f"{NEGATIVE_BASE}, {cleaned}" if cleaned else NEGATIVE_BASE


def has_visual_noise(text: object) -> bool:
    """True if ``text`` carries colour / lighting / render-quality / style noise —
    i.e. it is *not* already a clean visual-only descriptor list.

    Used to flag source prompts that the export will have to clean.
    """
    low = " ".join(str(text or "").split()).lower()
    if not low:
        return False
    if any(b in low for b in _BANNED_SUBSTRINGS):
        return True
    words = {w.lower() for w in _WORD_RE.findall(low)}
    return bool(words & _COLOUR_WORDS) or bool(words & _DROP_IF_CONTAINS_WORD)


# --- panel render-mode policy (BUNDLE-AUDIT #3) ----------------------------

# Recognised camera framings (BUNDLE-AUDIT #2), hyphens normalised to spaces.
# "action shot" / "reaction shot" are narrative beats, not framings — they are
# NOT in this set, so they get dropped from the panel header tag list.
CAMERA_SHOTS = {
    "establishing shot", "wide shot", "extreme wide shot", "long shot",
    "full shot", "medium shot", "medium close up", "close up", "extreme close up",
    "over the shoulder", "over the shoulder shot", "two shot", "low angle",
    "low angle shot", "high angle", "high angle shot", "dutch angle",
    "birds eye view", "worms eye view", "cowboy shot", "point of view shot",
    "pov shot", "insert shot", "aerial shot", "tracking shot",
}


def canonical_camera_shot(value: object) -> str:
    """Return a normalised camera-framing name, or ""  if ``value`` isn't one.

    Filters out narrative-beat tokens like "Action Shot" / "Reaction Shot" that
    upstream sometimes puts in the framing slot, and "Custom"/blank.
    """
    v = " ".join(str(value or "").replace("-", " ").replace("'", "").replace("’", "").split()).lower().rstrip(".")
    if not v or v in ("custom", "n/a", "none"):
        return ""
    if v in CAMERA_SHOTS:
        return v
    for known in CAMERA_SHOTS:
        if known in v or v in known:
            return known
    return ""


def render_mode_for_cast(named_character_count: int) -> tuple[str, str]:
    """Map an in-frame named-character count to (render_mode, warning).

    0 → t2i, 1 → i2i (one reference), 2 → i2i-2refs (ImageStitch),
    3+ → i2i-2refs with a warning (a 2-reference stitch can't hold a third).
    """
    n = max(0, int(named_character_count or 0))
    if n == 0:
        return "t2i", ""
    if n == 1:
        return "i2i", ""
    if n == 2:
        return "i2i-2refs", ""
    return "i2i-2refs", f"{n} characters in frame; only 2 references fit - pick the 2 most important"
