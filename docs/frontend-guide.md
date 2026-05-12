# Frontend Screens + Route Map

## Tech Stack

- Next.js 15 (App Router)
- React 19
- TypeScript
- Tailwind CSS + `cn()` utility (`clsx` + `tailwind-merge`)
- TanStack React Query
- Zustand (studio store)
- Framer Motion (animations)
- Lucide React (icons)
- react-force-graph-2d (relationship graph)

---

## 19 Studio Screens

All routes live under `/studio/[storyId]/`.

### Foundation Stage (3 screens)

| Screen | Route | File Key | Description |
|--------|-------|----------|-------------|
| **Studio Home** | `/home` | `status` | Stage-grouped dashboard with all phases, backend status, files |
| **Story Seed** | `/seed` | `master_story.json` | Title, idea, genre (multi-select), ending direction, story foundation |
| **World Core** | `/world` | `master_story.json` | World type, world rules (multi-select + custom), 10 rule detail fields, major factions (per-faction expandos), major+minor threats, 6 threat detail fields |

### Characters Stage (4 screens)

| Screen | Route | File Key | Description |
|--------|-------|----------|-------------|
| **Cast Forge** | `/cast` | `characters.json` | Main character structure (option selector), profile queue, major profile creation via `ProfileTabs` (7 tabs, 150+ fields), AI Fill panel, relationship map activation |
| **Side Cast** | `/side` | `characters.json` | List/create/edit side characters. AI Fill panel. Auto-generate full side cast from story context. Story Role & Fate section per character. |
| **Relationship Web** | `/web` | `characters.json` | **Locked** until 2+ major profiles exist. Force-directed graph via `react-force-graph-2d`. Click-to-select node details. Edge colors by relationship type. |
| **Faction Visuals** | `/faction-visuals` | `master_story.json` | Visual signatures per faction — positive/negative AI image prompts, style notes. |

### Plot Stage (4 screens)

| Screen | Route | File Key | Description |
|--------|-------|----------|-------------|
| **Plot Board** | `/board` | `plot_outline.json` | Narrative structure selector (Kishotenketsu/Three-Act/Hero's Journey/Custom), arc overview fields, structure editors (detailed sections per act), AI Fill panel, chapter creation modal with cross-reference selectors |
| **Scene Cards** | `/scenes` | `plot_outline.json` | Scene cards grouped by chapter. Each scene: location, time, characters (multi-select), goal, conflict, relationship dynamic, visual moment, panel mood, ending beat. Modal create/edit. |
| **Plot Threads** | `/threads` | `plot_outline.json` | 5-tab interface: Main Thread, Character Arcs, Relationships, Threats, Powers. Dynamic add/remove lists with detail fields per item. |
| **Locations** | `/locations` | `plot_outline.json` | Location CRUD. Each location: name, type, description, positive/negative AI image prompts. AI-fill individual locations or generate all. |

### Write Stage (2 screens)

| Screen | Route | File Key | Description |
|--------|-------|----------|-------------|
| **Writing Desk** | `/desk` | `plot_workspace.json` | Free writing textarea with: input type selector (7 options), AI expansion priority (5 modes), intent notes, protected sections list. AI expand with accept/discard. Consequence detect button. Shows AI preview + questions. |
| **Consequence Court** | `/court` | `plot_workspace.json` | Consequence questions from analysis, Yes/No/Custom answer buttons per question. AI suggest-answers. Final approve button → creates v002 bundle (events + patches + version + sync). |

### Produce Stage (4 screens)

| Screen | Route | File Key | Description |
|--------|-------|----------|-------------|
| **Manga Script** | `/script` | `chapter_script.json` | Chapter metadata, pages/panels with edit mode toggle. Panel: size selector (7 options), camera shot (13 options), pacing, visual description, character action, dialogue lines (speaker + text), SFX. Inline editing. Batch generate. |
| **Visuals Studio** | `/visuals-studio` | `chapter_script.json` | Visual description editor per panel. Batch-fill visuals across all chapters. AI prompt preview. |
| **Writing Desk** | `/desk` | `plot_workspace.json` | See Write stage — also accessible from Produce nav. |
| **Export** | `/export` | all files | Download story/scenes/visuals as `.md`/`.txt`/`.docx`. Visuals production bundle (ZIP). G-Ink Studio triple-zip. Raw JSON zip. Data-quality validation report. |

### Review Stage (3 screens)

| Screen | Route | File Key | Description |
|--------|-------|----------|-------------|
| **Memory Timeline** | `/timeline` | `versions` | Versioned story history — version cards with ID and status |
| **Continuity Radar** | `/radar` | `continuity` | Run current continuity check, view reports. 6 placeholder cards: Character State, Relationship Logic, World Rules, Power Rules, Version Sync, File Links. |
| **Control Room** | `/control` | `advanced` | Three JSON panels: Auth (me), Story Status, Current Files |

---

## Stage Grouping (lib/phases.ts)

```typescript
stage: "foundation"  → home, seed, world
stage: "characters"  → cast, side, web, faction-visuals
stage: "plot"        → board, scenes, threads, locations
stage: "write"       → desk, court
stage: "produce"     → script, visuals-studio, desk, export
stage: "review"      → timeline, radar, control
```

Navigation bar in `StudioShell` shows colored stage labels:
- Foundation → slate
- Characters → indigo
- Plot → emerald
- Write → amber
- Produce → rose
- Review → cyan

---

## Key Components

| Component | Path | Description |
|-----------|------|-------------|
| `StudioShell` | `components/studio/StudioShell.tsx` | Main layout shell with stage-grouped nav, status pills (version, template, sync, LLM) |
| `NextStep` | `components/studio/NextStep.tsx` | Prev/next phase navigation footer with stage dot indicators |
| `QueryProvider` | `components/studio/QueryProvider.tsx` | TanStack Query provider wrapped around studio routes |
| `Panel` | `components/cards/Panel.tsx` | Section panel container with title/subtitle |
| `JsonPreview` | `components/cards/JsonPreview.tsx` | Dark-mode JSON viewer |
| `Field` | `components/forms/Field.tsx` | Reusable form input/textarea with label |
| `OptionGrid` | `components/forms/OptionGrid.tsx` | Selectable option button grid (single/multi) |
| `CustomInput` | `components/forms/CustomInput.tsx` | Custom option text input with amber styling |
| `AiButton` | `components/forms/AiButton.tsx` | Sparkle button for AI actions |
| `AiFillPanel` | `components/forms/AiFillPanel.tsx` | Collapsible AI field panel with multi-select, generate, clear |
| `ProfileTabs` | `components/forms/ProfileTabs.tsx` | 7-tab character profile editor with 150+ fields |
| `RelationshipGraph` | `components/graph/RelationshipGraph.tsx` | D3 force-directed graph, color-coded nodes/edges |

---

## API Client (lib/api.ts)

Methods mapping 1:1 to backend routes. Base URL from `NEXT_PUBLIC_API_BASE_URL` (default `http://localhost:8080/api/v1`).

Key methods:
```typescript
api.getCharacters(storyId)
api.createCharacterProfile(storyId, body)
api.createSideCharacterProfile(storyId, body)
api.getPlotOutline(storyId)
api.getWorkspace(storyId)
api.saveFreeWriting(storyId, body)
api.analyzeWorkspace(storyId)
api.approveWorkspace(storyId)
api.aiGenerate(storyId, body)
api.getReferences(storyId)
```

All methods wrapped with `apiFetch<T>()` — handles envelope unwrapping, error extraction, debug logging.

---

## State Management

- **Zustand store** (`lib/store.ts`): `activePhase`, `advancedOpen`
- **React Query**: Server state per endpoint, stale time 20s
- **Local state**: Per-page `useState` for form fields, toggles, modals

---

## Type Definitions (lib/types.ts)

```typescript
ApiEnvelope<T> → { ok: boolean; data: T | null; error: {...} }
Phase → { key, title, href, file, description }
StoryStatus, StoryCreateResponse, MasterStoryFile, etc.
```

---

## Phase Gating Rules

- **Relationship Web** (`/web`): Locked until 2+ `created_major_character_profiles` exist (enforced by `_validate_characters`)
- Side characters do NOT count toward the unlock threshold
- Graph web endpoint returns both major and side characters as nodes

---

## Running

```bash
cd apps/web
npm install
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000
