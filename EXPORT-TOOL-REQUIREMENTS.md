# Export Tool — Required Changes for G-Ink Studio Compatibility

Generated after reviewing `new-g-ink-xport/` files against the studio's import pipeline.

---

## What the Studio Fixed on Its Side

These were bugs or missing features **in the studio** that have now been corrected so the new exports work:

| Fix | File changed | Detail |
|-----|-------------|--------|
| Markdown format support | `parseStory.js` | Added `normalizeStoryMarkdown()` — converts `## SECTION`, `## Chapter N:`, `## Story`, `## Chapter Review` headings to the plain-text format the parser expects. Both old and new formats now work. |
| Markdown format support | `parseVisuals.js` | Added `normalizeVisualsMarkdown()` — converts `# SECTIONS`, `## Chapter N:`, and `## Name - Type` character/location headings. Both formats work. |
| Multiple dialogue lines per panel | `parseVisuals.js` | `parsePanelFields()` now accumulates all `Dialogue:` lines into a single `\n`-joined string instead of keeping only the last one. |
| Render mode field | `parseVisuals.js` + `mergeIngest.js` | `Render mode:` field is now extracted from panels and stored as `panel.renderMode`. |
| LOCATIONS section parsing | `parseVisuals.js` | New `parseLocationsSection()` and `parseLocationBlock()` — parses the new `LOCATIONS` section into full location objects with `description`, `positivePrompt`, `negativePrompt`. |
| Location page tag | `parseVisuals.js` | Page header now accepts optional `- Location: Name` suffix: `Page 1 - Scene: X - Location: Y`. |
| Location assignment from visuals | `mergeIngest.js` | Parsed locations from the visuals file are created as full Location objects (with prompts). Panels tagged with `- Location:` get their `locationId` set directly (no heuristic needed). |
| Explicit location override | `mergeIngest.js` | `visualLocationsByName` map built from parsed locations so page-level location tags resolve to correct IDs. |

---

## Required Changes in the Export Tool

### Priority 1 — CRITICAL (studio gets empty or broken projects without these)

---

#### 1. Generate multiple pages per chapter

**Current:** Every chapter exports exactly 1 page with 5 panels.  
**Required:** Each chapter should expand to its full scene breakdown — one page per scene, typically 4–6 panels each.

The scenes file already has scene breakdowns:
```
Scene 1: scene_001  →  Page 1
Scene 2: scene_002  →  Page 2
Scene 3: scene_003  →  Page 3
...
```

Each scene goal should become one page. Panel count per scene should come from the script content. If scripts aren't generated for that chapter yet, use a minimum of 4 panels per page based on the scene goal.

**Impact:** Currently imports produce 13 pages total for a 13-chapter arc. Should produce ~50–80 pages.

---

#### 2. Add three missing character visual sheets

These characters are active in the story but have no entry in `CHARACTER REFERENCE SHEETS`:

**`silas`** — appears from Chapter 3. Former Bureau black-ops operative.
```
silas - Former Bureau Operative / Ally
---------------------------------------
  Age: 40s
  Gender presentation: Male
  ...
  AI prompt (positive): [describe visual]
  AI prompt (negative): [exclusions]
```

**`director kaelen`** — appears from Chapter 8. Bureau director antagonist.
```
director kaelen - Bureau Director / Antagonist
-----------------------------------------------
  Age: 50s-60s
  Gender presentation: Male
  ...
  AI prompt (positive): [describe visual]
  AI prompt (negative): [exclusions]
```

**`kinji's partner`** — referenced throughout as Kaito, now a semi-corporeal echo. Needs a visual sheet for scenes where their echo appears.
```
kinji's partner - Ghost Echo / Key Figure
------------------------------------------
  Age: 30s (at time of disappearance)
  Gender presentation: Male
  ...
  AI prompt (positive): [ghostly echo, translucent, static effect]
  AI prompt (negative): [exclusions]
```

---

### Priority 2 — HIGH (reduces output quality significantly)

---

#### 3. Add Location tag to each page header

**Current:** `  Page 1 - Scene: Shadows in the Rain`  
**Required:** `  Page 1 - Scene: Shadows in the Rain - Location: Kinji Sato's Run-down Apartment`

The location name must exactly match an entry in the `LOCATIONS` section (case-insensitive match is fine).  
Without this tag, the studio falls back to keyword heuristics — unreliable for locations with unique names like `The Echo Warehouse (Memory Labyrinth)`.

**Mapping to add:**

| Chapter | Scene | Location |
|---------|-------|----------|
| Ch.1 | Shadows in the Rain | Kinji Sato's Run-down Apartment |
| Ch.2 | Whispers in the Alleyway | Ohtani's Mnemonic Archive & Antiques Shop |
| Ch.3 | Fractured Trust | The Echo Warehouse (Memory Labyrinth) |
| Ch.4 | Static Interference | The Echo Warehouse (Memory Labyrinth) |
| Ch.5 | Fractured Frequencies | The Echo Warehouse (Memory Labyrinth) |
| Ch.6 | Echoes on the Rooftop | Rain-Slicked Rooftop Convergence Point |
| Ch.7 | Fractured Choices | Rain-Slicked Rooftop Convergence Point |
| Ch.8 | Amber Echoes | Project Stale Beer Subterranean Vault |
| Ch.9 | Gravity of Guilt | Project Stale Beer Subterranean Vault |
| Ch.10 | Confessions in Static | Project Stale Beer Subterranean Vault |
| Ch.11 | Static and Bone | Project Stale Beer Subterranean Vault |
| Ch.12 | The Anchor's Truth | The Mnemonic Mindscape (Reconstructed Precinct) |
| Ch.13 | The Final Report | The Static Archive Caverns |

---

#### 4. Add `silas` to RELATIONSHIPS

He is active from Chapter 3 but has no relationship entry. Add to `## RELATIONSHIPS`:
```
kinji sato/silas - mentor (Silas transitions from reluctant guide to tactical mentor, teaching Kinji echo navigation and Bureau mainframe hacking while helping him confront suppressed trauma.)
hina/silas - ally (Combat-focused alliance; they coordinate defensive maneuvers against Syndicate enforcers, trusting each other's tactical instincts.)
oddo/silas - ally (Coordinate under extreme pressure; Silas guides echo navigation while Oddo recalibrates suppression tech.)
```

---

### Priority 3 — NICE TO HAVE (polish and completeness)

---

#### 5. Fix typo in character name

**Current:** `old man landlrod`  
**Required:** `old man landlord`

Affects the character's slug, display name, and any relationship references.

---

#### 6. Remove Narration duplication

Currently panels have both:
```
      Narration: The warehouse holds its breath.
      Dialogue: Narrator (Narration): "The warehouse holds its breath."
```

The studio uses `Narration:` for caption boxes and `Dialogue:` for speech bubbles. Having the same text in both creates duplicate lettering objects. Choose one:
- Use `Narration:` for caption boxes (no speaker attribution needed)
- Use `Dialogue: Narrator (Narration): "text"` only if you want to mark it explicitly as a caption in the dialogue stream

**Recommended:** Keep `Narration:` for plain captions. Only use `Dialogue:` for actual character speech, thought, and SFX.

---

#### 7. Add `Status:` to chapters with complete scripts

Chapters that have complete panel scripts should export with `Status: approved`. This tells the studio the chapter is ready to work with immediately rather than sitting in draft state.

**Current:** `Status: approved` is present on some chapters but not consistently.  
**Required:** Any chapter where all pages have full dialogue + visual descriptions = `Status: approved`.

---

## Format Reference — What the Studio Expects

These are fixed rules the export must follow. The studio's parser enforces them strictly.

### Indentation levels (visuals file)
```
## Chapter N: Title          ← no indent (chapter header)

  Page N - Scene: Name - Location: Loc Name    ← 2 spaces
    Purpose: ...             ← 4 spaces
    Panel N [Size / Shot / Pacing]  ← 4 spaces
      Visual: ...            ← 6 spaces
      Action: ...            ← 6 spaces
      Background: ...        ← 6 spaces
      Expression: ...        ← 6 spaces
      Pose: ...              ← 6 spaces
      Mood: ...              ← 6 spaces
      Narration: ...         ← 6 spaces
      Dialogue: Name: "text" ← 6 spaces (repeat line for each speaker)
      SFX: ...               ← 6 spaces
      Render mode: t2i       ← 6 spaces
```

### Dialogue line format
```
      Dialogue: CharacterName: "speech text"
      Dialogue: CharacterName (Thought): "internal monologue"
      Dialogue: CharacterName (Shout): "shouted line"
      Dialogue: CharacterName (Whisper): "quiet line"
      Dialogue: CharacterName (Off-Screen): "voice from off panel"
```
Multiple `Dialogue:` lines per panel are fully supported — each becomes a separate speech bubble.

### Render mode values
| Value | Meaning |
|-------|---------|
| `t2i` | Standard text-to-image (default for establishing shots, action shots) |
| `i2i` | Image-to-image (use for continuity shots — close-ups, reactions, same character/same scene) |
| `layered` | Composited with character refs + location ref (future feature) |

### Location names must match LOCATIONS section
The name in `- Location: Name` must match (case-insensitive) a `## Name - Type` header in the `LOCATIONS` section. If there's no match, the panel falls back to keyword location detection.

---

## Summary Checklist for Export Tool

- [ ] **Generate multiple pages per chapter** (one per scene, 4–6 panels each)
- [ ] **Add silas visual sheet** to CHARACTER REFERENCE SHEETS
- [ ] **Add director kaelen visual sheet** to CHARACTER REFERENCE SHEETS
- [ ] **Add kinji's partner visual sheet** to CHARACTER REFERENCE SHEETS
- [ ] **Add `- Location: Name` tag** to every page header
- [ ] **Add silas relationships** to RELATIONSHIPS section
- [ ] **Fix typo:** `landlrod` → `landlord`
- [ ] **Remove narration duplication** (Narration: vs Dialogue: Narrator)
- [ ] **Mark completed chapters as** `Status: approved`
