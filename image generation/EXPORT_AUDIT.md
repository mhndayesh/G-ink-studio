# Export System Audit — "others" Manga Pipeline

**Date:** 2026-05-16
**Auditor:** Pipeline analysis post Stage 4 generation review

---

## Summary

The seed material (G-Ink Studio export) had two critical bugs causing silent data loss, two export-side bugs degrading prompt quality, and three missing fields that limit how well the AI generation engine can direct expression and composition. All parser-side issues have been fixed. The export-tool issues require changes in G-Ink Studio.

---

## Critical Bugs (Fixed in Parser)

### 1. Panel 1 (Establishing Shot) Dropped on Every Page

**Severity:** Critical
**Scope:** 52 panels lost — every opening establishing shot across all 16 chapters
**Root cause:** The panel-splitting regex `\n\s+Panel (\d+) [...]` requires a newline before `Panel`. The first panel in each page block has no leading newline so it fell into the pre-split garbage and was silently discarded.
**Symptom:** DB had 208 panels (4/page) instead of 260 (5/page). Generated pages started on the second panel — no establishing shots existed anywhere.
**Fix applied:** `parser.py` line 287 — prepend `"\n"` to `pg_body` before the split, matching the same pattern already used for the character/location block splits.
**Result:** 260 panels now in DB, all 5 panels per page confirmed across all chapters.

---

### 2. Narration Field Serialized as Raw Python Dict

**Severity:** High
**Scope:** Sporadic — affects panels where G-Ink Studio serializes narration as an object instead of plain text
**Root cause:** Export tool bug — certain narration entries are written as:
```
Narration: [{'speaker_name': 'Narrator', 'text': 'The only place left that feels real.', 'speech_bubble_type': 'Narration'}]
```
instead of:
```
Narration: The only place left that feels real.
```
**Symptom:** Narration text stored as raw dict string, appearing as garbage in prompt and lettering layers.
**Fix applied:** `parser.py` — added a pre-check that detects the dict pattern and extracts the `'text'` value before falling through to the normal narration parser.

---

## Export Tool Bugs (Require Fix in G-Ink Studio)

### 3. Character AI Prompts Truncated at Field Limit

**Severity:** High
**Scope:** Confirmed on Odo; likely affects other characters with long outfit descriptions
**Evidence:**
```
AI prompt (positive): ...A standard supermarket employee uniform (light shirt
```
Prompt cuts off mid-sentence — the dark trousers, disheveled appearance, and remaining descriptors are lost.
**Fix required:** Increase the AI prompt field export length limit in G-Ink Studio. No truncation should occur on any field that feeds the AI pipeline.

---

### 4. Key Character Descriptors Excluded from AI Prompt

**Severity:** High
**Scope:** All characters — distinctive features, pose language, and panel presence fields are never included in the exported AI prompt even though they contain the most visually distinctive information.

**Example — Kinji Sato:**

| Field | Content | In AI prompt? |
|---|---|---|
| Distinctive features | Permanent dark circles under eyes, constant cigarette smoke | No |
| Pose language | Slumped, leaning against walls, hands in pockets | No |
| Panel presence | Often drawn in shadows or obscured by smoke clouds | No |
| Expression style | Deadpan, cynical, half-lidded | No |
| AI prompt (positive) | Body type, hair, eyes, outfit, cigarette | Yes |

**Fix required:** Include `Distinctive features`, `Expression style`, `Pose language`, and `Panel presence` in the exported AI prompt field. These are the fields that make a character *recognizable* across panels — not just correctly described.

**Suggested export format for AI prompt:**
```
AI prompt (positive): [current content], [distinctive features], [expression style], [pose language], [panel presence note]
```

---

## Missing Fields — High Impact on Generation Quality

These fields do not exist in the current export format. Adding them would be the single biggest quality lever available from the authoring side.

### 5. No `Expression:` Field per Panel

**Current behavior:** The pipeline detects emotion by running regex patterns against the Visual and Action prose. This is fragile — "his eyes looking tired and cynical" triggers the exhaustion rule but misses subtleties and fails on indirect descriptions.

**What's needed:** An explicit expression tag per panel authored at the script level.

**Proposed field:**
```
Panel 2 [Wide Shot]
  Visual: Close-up on Kinji's face as he exhales cigarette smoke.
  Action: He takes a slow drag, his eyes looking tired and cynical.
  Expression: Kinji — exhausted, deadpan cynical, thousand-yard stare
  ...
```

**Pipeline impact:** The `prompt_engine.py` emotion rules would be applied as a fallback only. The explicit expression would be injected directly into the prompt as the primary emotion anchor.

---

### 6. No `Characters:` Field per Panel

**Current behavior:** The pipeline scans the Visual and Action text for known character name fragments and injects their visual anchor. This fails when:
- A character appears silently (not named in that panel's prose)
- A character is referred to by pronoun only ("He", "She")
- A background character is present but unnamed

**What's needed:** Explicit character list per panel.

**Proposed field:**
```
Panel 4 [Reaction Shot]
  Visual: Kinji stands up, grabbing a worn leather jacket.
  Action: He moves with slow, reluctant energy.
  Characters: kinji_sato
  ...
```

**Pipeline impact:** Character visual anchors would be injected by slug lookup, guaranteed. No more text mining.

---

### 7. No `Lighting:` Field per Panel

**Current behavior:** Scene-level `Time:` (Night/Morning/Afternoon/Evening) is stored in the DB but never flows into panel prompts. Panel-specific lighting exists only when the author happened to include it in the Visual prose.

**What's needed:** Explicit lighting note per panel, or at minimum the scene time-of-day automatically inherited.

**Proposed field:**
```
Panel 1 [Establishing Shot]
  Visual: A cramped, dimly lit apartment.
  Action: Kinji slumped in a worn-out chair.
  Lighting: single cold sliver of light from a cracked window, deep shadow fill
  ...
```

**Pipeline impact:** Lighting description injected directly into the prompt — the most deterministic way to control panel mood. Without it, the model chooses its own lighting, which is why scenes that should feel oppressive sometimes look neutral.

---

## Priority Order for Export Tool Changes

| # | Change | Effort | Impact |
|---|---|---|---|
| 1 | Fix narration serialization bug | Low | High |
| 2 | Remove field length truncation | Low | High |
| 3 | Include distinctive features + pose language in AI prompt | Low | High |
| 4 | Add `Expression:` field per panel | Medium | Very High |
| 5 | Add `Characters:` field per panel | Medium | High |
| 6 | Add `Lighting:` field per panel | Medium | High |

Items 1–3 fix what's broken. Items 4–6 unlock the next quality tier.

---

## Parser Readiness for New Fields

The ingest parser (`pipeline/src/manga_pipeline/ingest/parser.py`) is ready to consume the new fields the moment they appear in the export. The `PanelData` dataclass just needs the new fields added and the corresponding line-parsing logic, which follows the same pattern as existing `Visual:`, `Action:`, and `SFX:` fields.

No changes to the DB schema, Stage 4, or the prompt engine are required — the prompt engine already has the hooks to receive explicit expression, character list, and lighting overrides.
