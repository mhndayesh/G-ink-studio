# Manga Maker System — Architecture Overview

## Core Philosophy

Event-sourced story-state engine. Users write freely, the system detects consequences via LLM (or deterministic fallback), the user approves changes, and the backend creates versioned bundles synced to PostgreSQL + Neo4j (graph) + Qdrant (vector).

**Golden rule:** LLM proposes, user confirms. Never edit story JSON files directly — always go through the event/approval flow.

---

## Data Flow

```
User writes free text
       ↓
  PlotWorkspaceService.save_free_writing()
       ↓
  PlotWorkspaceService.ai_complete()     ← LLM or fallback
       ↓
  PlotWorkspaceService.analyze()         ← LLM extracts consequences + questions
       ↓
  User answers questions (Consequence Court)
       ↓
  PlotWorkspaceService.approve()
       ↓
  EventPatchService.create_from_approved_workspace()   ← creates official events + patches
       ↓
  VersionService.create_candidate_from_approved_events()  ← creates v002 bundle
       ↓
  VersionService.mark_official()         ← auto-syncs Graph + Vector + Continuity
```

---

## Six Official Story Files

| File | Service | Mutated via |
|------|---------|-------------|
| `master_story.json` | MasterStoryService | Approved events (patch template) |
| `characters.json` | CharacterService | Approved events (profiles, relationships) |
| `plot_outline.json` | PlotOutlineService | Approved events (chapters, scenes, arcs) |
| `memory_system.json` | TemplateStateService | **Frozen** per version — never edited |
| `plot_workspace.json` | PlotWorkspaceService | Ephemeral (free writing, AI, analysis) |
| `chapter_script.json` | ChapterScriptService | Approved events (pages, panels) |

All files maintain `story_id`, `version_id`, `file_type`, `state_type` invariants.

---

## 12 Backend Services

| Service | Responsibility |
|---------|----------------|
| `StoryService` | CRUD stories, list, status, current files, version manifests |
| `MasterStoryService` | Read/patch/validate master_story.json (genre, factions, threats) |
| `CharacterService` | Structure, major profiles, side profiles, relationship map |
| `PlotOutlineService` | Narrative structure, arc overview, chapters, scenes |
| `PlotWorkspaceService` | Free writing, AI completion, analysis, questions, approve |
| `EventPatchService` | Create official events + JSON patches from approved workspace |
| `VersionService` | Create candidate versions, mark official, sync graph/vector/continuity |
| `ChapterScriptService` | Generate, patch, extract events, approve chapter scripts |
| `ContinuityService` | Check continuity, run reports, version checks |
| `GraphService` | Project events to Neo4j (or local fallback), list projections, web graph |
| `VectorService` | Upsert memory chunks to Qdrant (or local fallback), list chunks |
| `LLMService` | AI completion, consequence extraction, field generation |
| `ValidationService` | Validate all 6 file types by schema rules |
| `SnapshotService` | Create v001 bundles from templates, file I/O |

---

## Version Lifecycle

```
v001 (template_state) ──approve──► events + patches ──create-candidate──► v002 (candidate)
       │                                                                       │
       └── never edited, always readable                                       │
                                                                               ▼
                                                                     mark-official ──► v002 (official)
                                                                                          │
                                                                                    graph_sync
                                                                                    vector_sync
                                                                                    continuity_sync
```

---

## State Types

- `template_state` — editable, working copy (current version)
- `story_state` — frozen, official version (read-only)
- `candidate` — pending version awaiting official mark

---

## API Conventions

- Base path: `/api/v1/`
- Unified response: `{ "ok": true, "data": {}, "error": null }`
- Error shape: `{ "ok": false, "data": null, "error": { "code": "...", "message": "...", "details": {} } }`
- Error handler: `MangaMakerError` → `manga_error_handler` in `app/core/errors.py`
- Routers mounted in `app/main.py`
- Auth: `X-Manga-User-Id` header (dev mode) or `Authorization: Bearer <key>` (api-key mode)
- Story ownership enforced on all `{story_id}` routes via `require_story_access`

---

## Frontend Architecture

```
Next.js App Router
  └─ /studio/[storyId]/layout.tsx → StudioShell (nav + status pills)
       ├── home       → stage-grouped dashboard
       ├── seed       → story seed (genre, ending, idea)
       ├── world      → world core (factions, threats, rules)
       ├── cast       → major character profiles
       ├── side       → side character profiles
       ├── web        → relationship graph (force-directed)
       ├── board      → plot board (arc, chapters, structure)
       ├── scenes     → scene cards
       ├── threads    → plot threads (character arcs, threats, powers)
       ├── desk       → writing desk (free writing, AI)
       ├── court      → consequence court (questions, approve)
       ├── script     → manga script studio
       ├── timeline   → memory timeline (versions)
       ├── radar      → continuity radar
       └── control    → control room (raw API access)
```

15 screens grouped into 6 stages: **Foundation**, **Characters**, **Plot**, **Write**, **Produce**, **Review**.

---

## AI Integration

The system has two AI pathways:

1. **PlotWorkspace AI** — free writing expansion + consequence detection via `LLMService`
2. **Field-Level AI** — inline generation for any form field via `POST /ai/generate`

Both support:
- Real LLM provider (OpenAI-compatible API)
- Deterministic fallback (no API key needed)
- User constraints (intent notes, protected sections)

---

## Safe Fallback Mode

Backend runs without Neo4j, Qdrant, or LLM. Disable individually via `.env`:

| Env Var | Default | Effect when false |
|---------|---------|-------------------|
| `MANGA_GRAPH_ENABLED` | true (docker) | Uses local fallback logs |
| `MANGA_VECTOR_ENABLED` | true (docker) | Skips Qdrant storage |
| `MANGA_LLM_ENABLED` | false | Deterministic fallback |

---

## Key File Locations

| Concern | Path |
|---------|------|
| FastAPI entrypoint | `apps/api/app/main.py` |
| Dependency injection | `apps/api/app/main_dependencies.py` |
| Pydantic models | `apps/api/app/models/` |
| Business logic (15 services) | `apps/api/app/services/` |
| REST endpoints (16 routers) | `apps/api/app/api/v1/` |
| DB connections | `apps/api/app/db/postgres.py` |
| Auth logic | `apps/api/app/core/auth.py` |
| SQL migrations | `apps/api/migrations/versions/` |
| DB schema | `apps/api/infra/postgres/schema.sql` |
| Story templates | `apps/api/app/templates/` |
| Frontend routes | `apps/web/app/studio/[storyId]/` |
| Frontend components | `apps/web/components/` |
| Frontend API client | `apps/web/lib/api.ts` |
| Frontend phases config | `apps/web/lib/phases.ts` |
| Frontend store | `apps/web/lib/store.ts` |
