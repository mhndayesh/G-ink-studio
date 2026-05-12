# G-Ink Studio — Asset File Format Specification

This document defines the **complete required format** for the three asset files that the story generation tool exports.  
The studio parses these files on import; missing sections or fields cause incomplete projects, broken prompts, and empty lettering.

---

## File Overview

| File | Purpose | Parser |
|------|---------|--------|
| `*-story` | Narrative structure, characters (backstory/traits), relationships, arc overview | `parseStory.js` |
| `*-visuals` | Character visual sheets + AI prompts, page/panel visual scripts | `parseVisuals.js` |
| `*-scenes` | Chapter scripts with dialogue — one per chapter | _(currently parsed manually; to be wired into ingest)_ |

---

## STORY FILE

### Required Top-Level Structure

```
{title}
======

{genre line — comma-separated: Genre1, Genre2 | Mode | Arc-length}

SYNOPSIS
--------
{free text paragraph}

WORLD
-----
Type: {world archetype}
Selected: {comma-separated world attributes}
Realms / Dimensions: {description}
Forbidden: {hard rules — what can't happen}

FACTIONS
--------
{comma-separated list of faction names}

THREATS
-------
Major threat: {threat name}
Source: {source entity/device}
Goal: {what the threat wants}
Target: {what it's targeting}
Stakes if it wins: {consequences}
Time limit: {countdown or condition}
Hidden truth: {what the threat really is — twist}

CHARACTERS
----------
{name} - {role}
  {backstory paragraph}. - Traits: Trait1, Trait2, Trait3

RELATIONSHIPS
-------------
{char1}/{char2} - {type} ({description of dynamic})

ARC OVERVIEW
------------
Structure: {structure name}
Arc: {arc title}
Arc length: {Short Arc / Long Arc / etc.}
Summary: {1-2 sentence summary}
Story question: {external question}
Emotional question: {internal/thematic question}
External conflict: {what they're fighting externally}
Internal conflict: {what the protagonist struggles with internally}
Relationship conflict: {interpersonal tension}
Ending target: {how this arc ends}

PLOT THREADS
------------
Main goal: {what they're trying to achieve}
  Obstacles: {comma or newline separated list}
  Turning points: {comma or newline separated list}
  Resolution: {how the main goal resolves}
Character arc {name}: {starting state} -> {ending state}

FULL STORY
==========

Chapter 1: {Title}
------------------
...
```

### CURRENTLY MISSING — Must Add

#### 1. Character arcs use IDs, not names

**Problem:** The PLOT THREADS section currently outputs `Character arc char_j4lb_j390:` with generated IDs. The studio cannot match these to characters.

**Required format:**
```
Character arc kinji sato: Detached chain-smoking PI, emotionally suppressed. -> Embraces chaos and moral obligation, channels emotion as power.
Character arc lorya: Mentor burdened by guilt over abandoning Ren. -> Reconciled with past, fully committed.
```
Use the **character's name** (lowercase, matching CHARACTERS section) as the key.

---

#### 2. Ren is completely missing

**Problem:** `ren` appears in RELATIONSHIPS as Mayomi's estranged brother but has **no CHARACTERS entry and no VISUALS sheet**. The studio will not create him as a character.

**Add to CHARACTERS section:**
```
ren - Antagonist / Enforcer
  Mayomi's estranged older brother, raised apart after a dimensional fracture separated them. Became a high-ranking Dimensional Purist enforcer. Manipulative and calculating, uses Lorya's past guilt as leverage. - Traits: Calculating, Loyal to faction, Manipulative, Protective (buried), Conflicted
```

---

#### 3. Lorya gender is contradictory

**Problem:** Story file says "grumpy old man" + visuals say `Gender presentation: female`. The studio stores both and they conflict.

**Fix in STORY file — CHARACTERS section:**  
Change Lorya's role from `Mentor Lead` to `Mentor Lead` (keep) but add a clarifying traits line, OR fix the visuals file (see below).

**Recommendation:** Decide if Lorya is male or female and make both files consistent. The visuals file currently says female — if that is correct, update the story prose to match.

---

### Optional Enhancements

#### 4. Faction visual signatures (for prompt injection)
Add after FACTIONS:
```
FACTION VISUALS
---------------
Dimensional Purists: black tactical uniforms, geometric insignia, visor helmets, cold blue lighting
Concord Council: pristine gray suits, glowing blue eye implants, sterile aesthetic
The Watchers of the Veil: layered vintage coats, dimensional burn scars, brass instruments
```
The studio can inject faction visual tags into panel prompts when characters wear faction gear.

---

## VISUALS FILE

### Required Top-Level Structure

```
VISUAL REFERENCE - {title}
===========================

CHARACTER REFERENCE SHEETS
==========================

{name} - {role}
-----------------------------------
  Age: {age or range}
  Gender presentation: {Male / Female / Non-binary / etc.}
  Height: {height with unit}
  Body type: {descriptor}
  Silhouette: {silhouette description}
  Face shape: {descriptor}
  Skin / markings: {skin tone + any marks}
  Hair style: {style descriptor}
  Hair color: {color}
  Eye shape: {shape descriptor}
  Eye color: {color}
  Clothing style: {style archetype}
  Main outfit: {full outfit description — used in prompts}
  Iconic item: {one signature prop}
  Expression style: {default expression}
  Pose language: {default pose}
  Panel presence: {how they appear in panels — framing notes}
  First impression: {what reader sees on first panel appearance}
  Distinctive features: {comma-separated unique visual identifiers}
  Scars / birthmarks: {optional}
  Alternate outfits: {comma-separated}
  Accessories: {comma-separated}
  Weapons / tools: {comma-separated}
  Color palette: {comma-separated hex or name}
  Visual symbol / motif: {recurring visual theme}
  Visual contrast: {how this character visually contrasts with others}
  AI prompt (positive): {full diffusion prompt — the most important field}
  AI prompt (negative): {negative prompt — what to avoid}

CHAPTERS
========

Chapter {N}: {Title}
---------------------
Status: {approved / draft}

  Page {N} - Scene: Scene {N} - Location: {location name}
    Purpose: {what this page accomplishes}
    Mood: {mood / atmosphere descriptor}
    Panel {N} [{Size} / {Camera Shot} / {Pacing}]
      Visual: {what the image shows — the rendered scene description}
      Action: {character movement / physical action}
      Background: {environment details}
      Expression: {face/emotion for close-up shots}
      Pose: {body language}
      Mood: {panel-level mood override if different from page}
      Narration: {caption box text — shown as lettering}
      Dialogue: {Speaker: "text" — shown as speech bubble in lettering stage}
      SFX: {sound effect text — shown as SFX lettering}
```

### CURRENTLY MISSING — Must Add

#### 5. Location tag on each Page

**Problem:** Pages currently have no location tag: `Page 1 - Scene: Scene 1`. The studio uses keyword heuristics to guess locations from background text, which is unreliable.

**Required change:**
```
Page 1 - Scene: Scene 1 - Location: Kinji's Apartment
Page 2 - Scene: Scene 2 - Location: City Streets
Page 3 - Scene: Scene 3 - Location: Mayomi's Café
```

The location name must match an entry in the LOCATIONS section (see below).

---

#### 6. Dialogue for ALL chapters (currently Ch.1–14 are empty)

**Problem:** Panels in chapters 1–14 have no `Dialogue:` field. The studio's lettering stage will produce blank speech bubbles for the entire arc except Ch.15.

**Required:** Add a `Dialogue:` field to every panel that has a spoken line. Format:
```
      Dialogue: Kinji: "Day fourteen. Still nothing worth reporting."
```
For panels with multiple speakers, use multiple Dialogue lines:
```
      Dialogue: Oddo: "You're overthinking it."
      Dialogue: Kinji: "Someone has to."
```
For narration captions (no speaker), use the existing `Narration:` field.

> **Note:** The scenes file already has complete scripts for Ch.15. These scripts should be merged back into the visuals file for Ch.15, and the same format used to generate scripts for Ch.1–14.

---

#### 7. Ren character sheet (visuals)

**Problem:** No visual sheet for `ren` exists. Without it, his panels will have no character reference for image generation.

**Add to CHARACTER REFERENCE SHEETS section:**
```
ren - Antagonist / Enforcer
----------------------------
  Age: Late 20s
  Gender presentation: Male
  Height: 5'11" (180 cm)
  Body type: Athletic / Lean-muscular
  Silhouette: Upright military posture, broad shoulders, rigid stance
  Face shape: Sharp angular features, strong jaw, high cheekbones
  Skin / markings: Light olive, faint dimensional burn scar across left cheek
  Hair style: Short, cropped tight on sides, slightly longer on top, slicked back
  Hair color: Dark black
  Eye shape: Narrow, piercing, always calculating
  Eye color: Steel blue with faint dimensional shimmer
  Clothing style: Purist military-tactical
  Main outfit: Black form-fitting tactical bodysuit with geometric silver insignia on chest, reinforced combat gloves, heavy boots with Purist insignia embossed on the sole
  Iconic item: A dimensional suppression baton that disrupts resonance fields
  Expression style: Cold neutral mask with rare flashes of buried emotion when Mayomi is mentioned
  Pose language: Controlled, deliberate — never wastes a movement, always facing exits
  Panel presence: Often framed from low-angle to emphasize authority; shadows cut across face
  First impression: A black-uniformed enforcer stepping through a blast door, weapon lowered but not holstered, voice perfectly steady.
  Distinctive features: Silver Purist insignia badge, dimensional burn scar on cheek, steel-blue eyes with shimmer
  Scars / birthmarks: Burn scar across left cheek from dimensional fracture
  Accessories: Purist comm earpiece, geometric insignia badge
  Weapons / tools: Dimensional suppression baton, compact sidearm, encrypted data tablet
  Color palette: Black, Silver, Steel Blue, Deep Gray
  Visual symbol / motif: Geometric fracture lines (Purist aesthetic)
  Visual contrast: Rigid, uniformed precision against Kinji's slouchy rumpled detective look; represents the order vs chaos theme visually
  AI prompt (positive): Manga style, male antagonist character, late 20s, sharp angular face, dark cropped hair, steel blue eyes with slight glow, wearing black tactical bodysuit with silver geometric insignia, standing in underground facility, cold calculating expression, dramatic side lighting, detailed background
  AI prompt (negative): casual clothes, relaxed posture, bright warm colors, smiling, superhero costume, fantasy armor
```

---

#### 8. LOCATIONS section (completely absent — critical)

**Problem:** There is no LOCATIONS section in the visuals file. The studio has a full Locations system with positive/negative AI prompts per location. Without it, every panel background is generated from scratch with no consistency.

**Add a new top-level section BEFORE `CHAPTERS`:**

```
LOCATIONS
=========

kinji's apartment - Interior / Residential
-------------------------------------------
  Description: Cramped one-room apartment on a mid-floor of a rundown residential building. Case files stacked on every surface. Beer cans and takeout containers. Dusty venetian blinds filtering amber streetlight.
  AI prompt (positive): cramped messy detective apartment interior, stacked case files, beer cans, peeling wallpaper, dim amber lamplight filtering through dusty venetian blinds, noir atmosphere, detailed manga background
  AI prompt (negative): clean modern apartment, bright lighting, minimalist, organized, luxurious

mayomi's café - Interior / Commercial
--------------------------------------
  Description: A small warm café on a quiet street corner. Wooden counter with vintage equipment. Soft warm lighting. Steam from an old espresso machine.
  AI prompt (positive): cozy café interior, wooden counter, vintage espresso machine, steam, warm amber lighting, small round tables, quiet neighborhood street visible through window, detailed manga background, soft shadows
  AI prompt (negative): modern chain café, neon signs, industrial aesthetic, cold lighting, crowded

city streets - Exterior / Urban
---------------------------------
  Description: Grey mid-sized city streets. Overcast sky. Old buildings with neon signs. Wet pavement reflecting streetlights. Few pedestrians.
  AI prompt (positive): manga city street, overcast grey sky, wet pavement, neon signs reflected in puddles, old urban architecture, dim streetlights, sparse pedestrians, noir atmosphere
  AI prompt (negative): crowded Tokyo, bright daytime, futuristic megacity, clean pristine street

subway maintenance hub - Interior / Underground
-------------------------------------------------
  Description: Abandoned underground subway maintenance facility. Concrete walls with dimensional murals. Emergency lighting. Resonance equipment and ancient crystal logs. Dripping pipes.
  AI prompt (positive): abandoned underground facility, concrete walls with glowing dimensional murals, emergency red lighting, old maintenance equipment, crystalline energy nodes, dripping water, detailed manga background, tense atmosphere
  AI prompt (negative): modern clean facility, bright white lighting, futuristic lab, empty sterile

radio tower - Exterior and Interior / Industrial
-------------------------------------------------
  Description: Derelict radio transmission tower on a hill outside the city. Rusted metal lattice structure. Control room inside with old equipment and broken screens.
  AI prompt (positive): derelict radio tower, rusted metal lattice, stormy sky, broken transmission equipment, cracked screens, dim industrial lighting, manga detailed background
  AI prompt (negative): modern communications tower, clean steel, bright sky, operational equipment

power substation - Interior / Industrial
-----------------------------------------
  Description: Large electrical substation repurposed as a Convergence Engine node. Massive crystalline conduits pulsing with blue energy. Sterile white walls cracking with golden energy veins.
  AI prompt (positive): massive power substation interior, crystalline energy conduits pulsing blue and gold, sterile white walls fracturing with golden light, dramatic energy lighting, industrial scale, manga background
  AI prompt (negative): normal substation, dim, no energy effects, small scale

concord council vehicle interior - Interior / Vehicle
------------------------------------------------------
  Description: Sleek black SUV interior. Sterile. Occupants sit rigid and unmoving. Faint blue glow from their eyes. Hum emanates from chassis.
  AI prompt (positive): sleek black vehicle interior, sterile rigid seats, faint blue ambient glow, passengers sitting perfectly still, unsettling calm atmosphere, manga interior detail
  AI prompt (negative): normal car, messy interior, people moving, warm lighting

old man's building corridor - Interior / Residential
-----------------------------------------------------
  Description: Narrow dimly-lit corridor of an old apartment building. Peeling paint, brass fixtures, flickering bulb. Old man's domain. Smells of pipe tobacco.
  AI prompt (positive): narrow dim apartment corridor, peeling paint, brass door fixtures, flickering overhead bulb, old wooden floor, pipe smoke haze, manga background, vintage atmosphere
  AI prompt (negative): modern hallway, clean bright walls, contemporary fixtures
```

---

#### 9. Render mode hints on panels (optional but useful)

For panels that would benefit from specific generation modes, add:
```
      Render mode: t2i
```
or
```
      Render mode: layered
```
Valid values: `t2i` (text-to-image, default), `i2i` (image-to-image for continuity), `layered` (character refs + location ref composited).

---

## SCENES FILE

The scenes file currently has chapter-level scripts for Ch.15 only. All 15 chapters need complete scripts.

### Required Structure Per Chapter

```
Chapter {N}: {Title}
--------------------
Chapter purpose: {one sentence}
Chapter summary: {2-3 sentences}
Chapter conflict: {main tension of the chapter}
Chapter hook: {what sets up the next chapter — last moment}
Script: {generated or not generated}

Scene {N}: scene_{NNN}
  Goal: {what this scene accomplishes}
  Script:
  - Page {N}
    Panel {N} [{Size}]
      Visual: {image description}
      Action: {character physical action}
      Narration: {caption text if any}
      {CharacterName}: "{dialogue line}"
      {CharacterName} (Thought): "{internal monologue}"
      {CharacterName} (Shout): "{shouted line}"
      {CharacterName} (Whisper): "{whispered line}"
      SFX: {SOUND EFFECT TEXT}
```

### Dialogue attribution format

The studio lettering system needs the speaker name to generate the correct bubble type:

| Format | Bubble type |
|--------|------------|
| `Name: "text"` | Standard speech bubble |
| `Name (Thought): "text"` | Thought cloud |
| `Name (Shout): "text"` | Jagged/shout bubble |
| `Name (Whisper): "text"` | Whisper/small bubble |
| `Name (Off-Screen): "text"` | Off-panel arrow bubble |
| `Narration: text` | Caption box (no speaker) |

### CURRENTLY MISSING — Must Add

All chapters 1–14 need `Script:` sections generated. Priority order based on studio workflow:

| Chapter | Script status | Priority |
|---------|--------------|----------|
| Ch.1 The Quiet World | not generated | High — intro chapter |
| Ch.2 Static in the Veil | not generated | High |
| Ch.3 Descent into the Static | not generated | High |
| Ch.4 Bloodline Resonance | not generated | High — Ren's intro |
| Ch.5–14 | not generated | Medium |
| Ch.15 The Resonance Overload | **COMPLETE** | Done |

---

## Summary Checklist

### Critical — Studio cannot function without these

- [ ] **LOCATIONS section** added to visuals file with 8+ named locations + AI prompts
- [ ] **Location tag** on every Page line: `Page N - Scene: ... - Location: {name}`
- [ ] **Dialogue fields** for all panels in Ch.1–14 (currently empty)
- [ ] **Ren character sheet** added to visuals file (full visual + AI prompts)
- [ ] **Ren character entry** added to story file CHARACTERS section

### High Priority — Significantly improves output quality

- [ ] **Lorya gender resolved** — pick male OR female, make story + visuals consistent
- [ ] **Character arc names** in PLOT THREADS use character names, not generated IDs
- [ ] **Scripts for Ch.1–4** generated and added to scenes file

### Nice to Have — Enhances AI features

- [ ] **FACTION VISUALS section** in story file
- [ ] **Render mode hints** on panels requiring layered generation
- [ ] **Scripts for Ch.5–14** generated and added to scenes file
- [ ] **Alternate outfit panels** tagged with which outfit is worn

---

## Parser Limitations to Be Aware Of

The studio parsers are strict about indentation and heading format. If files deviate from the format, fields will be silently dropped.

| Rule | Detail |
|------|--------|
| Character block header | `name - role` followed by `---` underline — no spaces before name |
| Panel header | `    Panel N [Size / Camera Shot / Pacing]` — exactly 4 spaces indent |
| Panel field | `      Field: value` — exactly 6 spaces indent |
| Page header | `  Page N - Scene: Scene N` — exactly 2 spaces indent |
| Section headers | ALL CAPS followed by `---` or `===` underline |
| Story character block | Name must be all lowercase; role after ` - ` separator |

---

## Field Reference: What the Studio Uses

### From story file

| Field | Used for |
|-------|---------|
| `title` | Project name |
| `genre` | `globalStyle` base prompt |
| `synopsis` | `manga.synopsis`, display in UI |
| `world` | `_ingest.world` metadata |
| `threats` | `_ingest.threats` metadata |
| `characters[].backstory` | `character.backstory` |
| `characters[].traits` | `character.traits[]` |
| `arcOverview.title` | Arc name |
| `arcOverview.summary` | Arc summary |
| `chapters[].purpose` | Chapter purpose |
| `chapters[].summary` | Chapter summary |
| `chapters[].hook` | Chapter hook |

### From visuals file

| Field | Used for |
|-------|---------|
| `character.positivePrompt` | Base positive prompt in image generation |
| `character.negativePrompt` | Base negative prompt |
| `character.fields.*` | `character.visualData.*` (displayed in character card) |
| `panel.visual` | `panel.visual` — core of compiled prompt |
| `panel.characterAction` | Added to prompt |
| `panel.backgroundDetails` | Added to prompt, used for location keyword matching |
| `panel.cameraShot` | `panel.cameraShot` |
| `panel.mood` | `panel.mood` |
| `panel.narration` | Stored as `panel.narration`, rendered as caption in lettering |
| `panel.dialogue` | Stored as `panel._rawDialogue`, parsed for lettering bubbles |
| `panel.sfxText` | Stored as `panel.sfxText`, rendered as SFX lettering |

### From locations section (new — needs parser support)

| Field | Used for |
|-------|---------|
| `location.name` | `location.name`, display + matching |
| `location.description` | `location.description` |
| `location.positivePrompt` | Injected into panel prompt when `panel.locationId` set |
| `location.negativePrompt` | Injected into panel negative prompt |
