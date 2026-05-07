# Frontend Guide

## Overview

The frontend is a Next.js App Router application built around the **Manga Studio Flow** — a guided, phase-based UX that maps directly to backend story-state operations. Users interact with screens, not raw JSON.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| Next.js App Router | File-based routing, Server Components |
| React 18+ | UI library |
| TypeScript | Type safety across the app |
| Tailwind CSS | Utility-first styling |
| shadcn/ui | Accessible component primitives |
| TanStack Query | Backend data fetching and caching |
| Zustand | Local UI state (sidebar, modals, drafts) |
| React Hook Form + Zod | Form validation |
| React Flow | Relationship graph visualization (planned) |
| Monaco Editor | Raw JSON debug view (advanced mode) |

## Route Structure

```
app/
├── studio/
│   ├── page.tsx                    # Studio landing — pick or create story
│   └── [storyId]/
│       ├── layout.tsx              # Studio shell: phase rail + bottom dock
│       │
│       ├── home/page.tsx           # Dashboard — project status cards
│       ├── seed/page.tsx           # Story Seed — title, idea, genre, ending
│       ├── world/page.tsx          # World Core — rules, factions, threats
│       ├── cast/page.tsx           # Cast Forge — character profiles
│       ├── web/page.tsx            # Relationship Web — relationship map
│       ├── board/page.tsx          # Plot Board — arcs, chapters, scenes
│       ├── desk/page.tsx           # Writing Desk — free writing + AI
│       ├── court/page.tsx          # Consequence Court — answer questions
│       ├── script/page.tsx         # Manga Script Studio — panels/pages
│       ├── timeline/page.tsx       # Memory Timeline — version history
│       ├── radar/page.tsx          # Continuity Radar — contradictions
│       └── control/page.tsx        # Control Room — developer JSON view
```

## Screen Reference

### 1. Studio Home (`/studio`)

**Purpose:** Landing page to create a new story or continue an existing one.

**Backend calls:**
- `GET /stories` (list user's stories)
- `POST /stories` (create new story)

---

### 2. Dashboard — Home (`/[storyId]/home`)

**Purpose:** Show project status at a glance, not editing.

**Displays:**
- Story Setup: incomplete / complete
- Characters: incomplete / complete
- Relationship Map: locked / ready / complete
- Plot Outline: not started / active
- Current Workspace: free writing / analysis ready
- Chapter Script: draft / approved
- Current Version + Continuity status

**Backend calls:**
- `GET /stories/{id}/status`
- `GET /stories/{id}/current-version`
- `GET /stories/{id}/files/current`

---

### 3. Story Seed (`/[storyId]/seed`)

**Purpose:** Fill in `master_story.json` foundation — step by step, not all at once.

**Steps:**
1. Title + Basic Idea
2. Story Type / Genre (multi-select chips)
3. Ending Direction (single-select cards)
4. Story Foundation
5. World Type
6. World Master Rules (checkboxes + detail textareas)
7. Factions / Ruling Sides
8. Major + Minor Threats

**Backend calls:**
- `GET /stories/{id}/master-story`
- `PATCH /stories/{id}/master-story/template`
- `POST /stories/{id}/master-story/validate`

---

### 4. World Core (`/[storyId]/world`)

**Purpose:** Define world scale, rules, factions, and threats.

**Components:**
- World Scale Selector (micro → epic)
- World Rule Grid (checkboxes: Magic, Superpowers, Demons, etc.)
- Rule Detail Drawer (expandable textareas per rule)
- Faction Board (add/edit factions with goals)
- Threat Builder (major + minor threats)

**Backend calls:** Same as Story Seed — all update `master_story.json` via template patches.

---

### 5. Cast Forge (`/[storyId]/cast`)

**Purpose:** Create character profiles from `characters.json`.

**Layout:** Three-panel split
- Left: Character structure selector + profile queue
- Center: Current character form (tabs)
- Right: Preview card

**Character tabs:** Identity, Appearance, Faction Alignment, Backstory, Mental State, Community Place, Personality, Powers, Arc & Threat Connection

**Unlock rule:** Relationship map stays locked until `created_major_character_profiles.length >= 2`.

**Backend calls:**
- `GET /stories/{id}/characters`
- `PATCH /stories/{id}/characters/structure`
- `POST /stories/{id}/characters/profiles`
- `PATCH /stories/{id}/characters/profiles/{charId}`

---

### 6. Relationship Web (`/[storyId]/web`)

**Purpose:** Manage character relationships from `characters.json`.

**Locked state:** Shows locked message with reason: "Create at least 2 major characters first."

**Two views (when unlocked):**
- Table view: Character A | Type | Character B | Trust | Conflict | Change Arc
- Graph view: Nodes = characters, Edges = relationship type + color

**Backend calls:**
- `POST /stories/{id}/characters/relationship-map/activate`
- `POST /stories/{id}/characters/relationships`

---

### 7. Plot Board (`/[storyId]/board`)

**Purpose:** Official plot planning from `plot_outline.json`. NOT free writing.

**Sections:**
- Story Start Workflow (Plan First Arc Then Chapter, etc.)
- Narrative Structure Selector (Kishotenketsu / Three-Act / Shonen / War)
- Arc Overview
- Kishotenketsu Outline (Ki/Sho/Ten/Ketsu form — shown only when selected)
- Conflict-Driven Outline (shown for Hybrid mode)
- Chapter List (cards with drag reorder)
- Scene Cards
- Plot Threads

**Backend calls:**
- `GET /stories/{id}/plot-outline`
- `PATCH /stories/{id}/plot-outline/narrative-structure`
- `POST /stories/{id}/plot-outline/chapters`
- `POST /stories/{id}/plot-outline/scenes`

---

### 8. Writing Desk (`/[storyId]/desk`) — **Most Important Screen**

**Purpose:** Free writing workspace from `plot_workspace.json`. The heart of the product.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│ Topbar: Story | Version | State | Continuity        │
├──────────┬────────────────────┬─────────────────────┤
│ Left     │ Center             │ Right               │
│ Context  │ Free writing       │ AI/analysis panel   │
│ - Arc    │ [large textarea]   │ Detected changes    │
│ - Chapter│                    │ Questions           │
│ - Chars  │                     │ Warnings            │
│ - Threats│                    │                     │
├──────────┴────────────────────┴─────────────────────┤
│ Bottom: Final confirmation panel (after approval)   │
└─────────────────────────────────────────────────────┘
```

**Controls:**
- [ ] AI Completion / Expand Writing toggle
- Expansion mode selector: Light / Medium / Heavy / Add Manga Visual Detail / Add Dialogue
- [Expand] button
- [Analyze Consequences] button (mandatory)

**Workflow on screen:**
1. User writes → 2. Optional AI expands → 3. Accept/Reject → 4. Analyze → 5. Detected events appear → 6. Questions shown → 7. Final confirmation panel appears → 8. Approve/Reject

**Backend calls:**
- `POST /stories/{id}/plot-workspace`
- `PATCH /.../free-writing`
- `POST /.../ai-complete`
- `POST /.../analyze`
- `GET /.../questions`
- `POST /.../questions/{id}/answer`
- `GET /.../confirmation`
- `POST /.../approve`

---

### 9. Consequence Court (`/[storyId]/court`)

**Purpose:** Review and approve detected changes before they become official.

**Four sections:**
1. Detected Changes (plain English summary)
2. User Decisions (answers to questions)
3. Proposed Official Events (with event types)
4. Proposed JSON Patches (collapsible — raw view behind "Advanced" dropdown)

**Buttons:** Approve All / Reject All / Edit Specific Change / Go Back To Questions

**Backend calls:**
- `GET /.../confirmation`
- `POST /.../approve`
- `POST /.../reject`

---

### 10. Manga Script Studio (`/[storyId]/script`)

**Purpose:** Clean manga script from `chapter_script.json`.

**Layout:**
- Left: Scene list (tree view)
- Center: Page/panel editor
- Right: Context and continuity notes

**Script hierarchy:** Chapter → Scenes → Pages → Panels

**Panel fields:** Panel size, Camera shot, Visual, Character action, Background details, Facial expression, Pose/body language, Dialogue, Narration, SFX, Mood, Pacing, Continuity notes

**Backend calls:**
- `POST /stories/{id}/chapters/{id}/script/generate`
- `PATCH /.../script` (targeted panel patch)
- `POST /.../script/extract-events`
- `POST /.../script/approve`

---

### 11. Memory Timeline (`/[storyId]/timeline`)

**Purpose:** Trust and transparency — show version history.

**Each version card shows:** Version ID, Created from events, Files included, Continuity status, View snapshots button, Compare to previous button.

**Backend calls:**
- `GET /stories/{id}/versions`
- `GET /stories/{id}/versions/{vid}`
- `GET /stories/{id}/versions/{vid}/manifest`

---

### 12. Continuity Radar (`/[storyId]/radar`)

**Purpose:** Show and resolve story contradictions.

**Severity levels:**
- High: Dead character appears alive in Chapter 4
- Medium: City A destroyed but listed as active location
- Low: Relationship tension changed but relationship map not updated

**Actions per issue:** Fix with AI / Mark as intentional / Create event to explain / Ignore for now

**Backend calls:**
- `POST /stories/{id}/continuity/check-workspace`
- `GET /stories/{id}/continuity/reports`

---

### 13. Control Room (`/[storyId]/control`) — Advanced Mode Only

**Purpose:** Developer/debug view of raw JSON files.

**Tabs:** master_story.json, characters.json, plot_outline.json, memory_system.json, plot_workspace.json, chapter_script.json

Uses Monaco Editor for syntax-highlighted JSON viewing/editing. Read-only by default; edit requires advanced unlock. Never edits frozen versions.

## Unlock Rules (Phase Gating)

| Screen | Unlocks When |
|--------|-------------|
| Story Seed | Always |
| World Core | After title + basic idea exist |
| Cast Forge | After master story minimum setup |
| Relationship Web | After 2 real major character profiles created |
| Plot Board | After minimum character phase complete |
| Writing Desk | After plot outline has target arc/chapter |
| Consequence Court | After detected events/questions exist |
| Manga Script Studio | After scene cards or approved workspace |
| Memory Timeline | Always visible after story creation |
| Continuity Radar | Always visible after story creation |
| Control Room | Advanced mode only |

## State Management

| Library | Used For | Not Used For |
|---------|----------|-------------|
| TanStack Query | Backend data: story status, JSON files, workspace, questions, confirmation, versions, continuity reports | — |
| Zustand | Local UI state: sidebar open/close, active tab, draft unsaved state, modal state, selected graph node | Official story state (lives in backend) |

## API Configuration

```typescript
// .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1
NEXT_PUBLIC_MANGA_USER_ID=dev_user
NEXT_PUBLIC_MANGA_API_KEY=
```
