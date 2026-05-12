# Manga Maker System — Agent Instructions

## Source of Truth

The only source trees are **`apps/api`** (FastAPI backend) and **`apps/web`** (Next.js frontend) at the repo root. There is no longer an `integrated/manga_maker_integrated_v1_2/` wrapper or any `backend/` / `frontend/` legacy ZIP extracts — if you see references to those in old notes, they're stale.

Canonical reference docs: this file (agent runbook), `CLAUDE.md` (detailed dev guide), `RUN-COMMANDS.md` (run/troubleshoot), `WORKFLOW.md` (authoring workflow), `docs/` (architecture, guides, schema), `docs/REPO-CRITIQUE.md` (known issues + roadmap).

## Architecture at a Glance

Event-sourced story-state engine: users write freely, system detects consequences via LLM (or deterministic fallback), user approves changes, backend creates versioned bundles synced to PostgreSQL + Neo4j (graph) + Qdrant (vector).

**Core rule:** LLM proposes, user confirms. Never edit story JSON files directly — always go through the event/approval flow.

## Six Official Story Files

| File | Service | Mutated via? |
|------|---------|-------------|
| `master_story.json` | MasterStoryService | Approved events |
| `characters.json` | CharacterService | Approved events |
| `plot_outline.json` | PlotOutlineService | Approved events |
| `memory_system.json` | TemplateStateService | Frozen per version |
| `plot_workspace.json` | PlotWorkspaceService | Ephemeral (free writing) |
| `chapter_script.json` | ChapterScriptService | Direct edit + approve |

**Filename rule:** Always use `plot_outline.json`, never `plot_outline(1).json`.

## Quick Start (Windows)

> **Port note:** Backend on **8080** because 8000 is taken by open-notebook SurrealDB. Docker Compose maps the API to 8000 internally. The frontend `.env.example` is pre-configured for 8080.

```powershell
# Backend
cd apps\api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080

# Frontend (new terminal)
cd apps\web
npm install
copy .env.example .env.local   # already pre-configured for 8080
npm run dev
```

> **Do NOT use bare `uvicorn` or `--reload` on Windows:** bare `uvicorn` can resolve to system Python instead of the venv, and `--reload` is unreliable and can serve stale bytecode. After edits: kill the process, delete `__pycache__` dirs, then restart fresh.

**Verify:** `npm run lint`, `npm run build`, backend `python tests\smoke_test.py` → expect `"passed": true`.

## Docker Compose (Full Stack)

From ``:

```bash
docker compose up --build    # API :8000 (in container), Web :3000, Neo4j :7474/:7687, Qdrant :6333
```

## Safe Fallback Mode

Backend runs without Neo4j, Qdrant, or LLM. Disable individually via `.env`:

| Env Var | Default (docker) | Effect when false |
|---------|------------------|-------------------|
| `MANGA_GRAPH_ENABLED` | true | Uses local SQLite fallback logs instead of Neo4j |
| `MANGA_VECTOR_ENABLED` | true | Uses deterministic SHA-256 bag-of-words hashing instead of Qdrant |
| `MANGA_LLM_ENABLED` | false | Deterministic fallback for all AI features |

**Best setup order:** Backend → test health → frontend → create story → add Neo4j/Qdrant → add LLM last. Do not start everything at once.

## Writing Workspace Flow (Core Workflow)

```
1. POST /api/v1/plot-workspace/free-writing     # User writes freely
2. POST /api/v1/plot-workspace/ai-complete      # Optional AI expansion
3. POST /api/v1/plot-workspace/analyze          # Detect consequences
4. POST /api/v1/questions/{id}/answer           # Answer generated questions
5. GET  /api/v1/plot-workspace/confirmation     # Review final state
6. POST /api/v1/plot-workspace/approve          # Marks workspace reviewed only
```

## Current Architecture State (Hard-Won Context)

### Version Snapshots

**Per-chapter version snapshots happen on Manga Script approve, NOT on Writing Desk approve.** Writing Desk approve only marks the workspace as reviewed. When the user approves a chapter script (`POST /api/v1/chapter-script/approve`), `create_simple_snapshot()` creates a version bundle with `created_from_events: []` — no events or patches are involved.

### Dead Pipelines

- `story_events` and `json_patches` tables are effectively dead. `EventPatchService.create_from_approved_workspace()` is no longer called anywhere. The old Extract Events pipeline is commented out as dead code in both backend (`chapter_script_service.py`) and frontend (`script/page.tsx`, `lib/api.ts`). Do NOT wire it back unless explicitly asked.
- `EventPatchService` and `PatchService` imports in the Writing Desk approve endpoint were intentionally removed.

### MUST_APPROVE_CURRENT_CHAPTER Guard

`generate_from_workspace()` and `load_from_history()` both reject with 409 if the current working script has unapproved pages for a different chapter. Frontend disables approve/extract/edit for historical chapters. User must approve current chapter before switching.

### Arc Length Lock

Arc/chapter creation requires selecting an explicit arc length. Backend rejects chapter creation with `ARC_LENGTH_REQUIRED` (409) when length is missing. Plot Board marks the field red until a length is selected.

### AI flow gates (added 2026-05-07)

Every AI entry point on the studio gates on the data its prompt actually depends on. Don't relax these without a reason — silent "AI did nothing" was the most-reported bug before they were added.

- **Plot Board** AI requires `arc_length_type` AND `narrative_structure.selected`. Both are saved live the moment the user picks them (`handleSelectStructure`, `handleSelectArcLength` in `apps/web/app/studio/[storyId]/board/page.tsx`) so the very next LLM call sees them in the saved JSON context, not just in `generation_hints`.
- **Plot Threads** AI requires arc overview filled (`arc_title || arc_summary`).
- **Consequence Court** AI requires ≥1 question to exist.
- **Scene Cards** AI requires ≥1 selected chapter.
- **Cast / Side** AI requires an open profile with a name.

`AiFillPanel` auto-applies generated results to the form via `onApply` instead of forcing the user to click a tiny "Apply" link — every consumer of the panel is expected to either consume the results in `handleApplyAi` and clear them, or render its own preview.

### Stable relationship IDs (added 2026-05-07)

`character_relationship_map.relationships[*].relationship_id` is now a deterministic slug `rel_<slugA>__<slugB>` derived from `characters_involved`. Three layers reinforce this:

1. `apps/api/app/services/character_service.py::apply_relationship_updates` writes the slug ID on every new relationship and lazy-migrates any pre-existing entries that still lack one.
2. `apps/api/app/api/v1/ai.py::get_references` falls back to the same slug if the stored ID is empty, so the frontend dropdown always has a usable value.
3. `apps/api/app/services/llm_service.py::_backfill_thread_ids` runs after every threads generation and fills missing `relationship_id` / `character_id` / `threat_id_or_name` by name-matching the item's text against the saved cast and relationships. Without this, `saveItemListThreads` silently drops items whose id-field is empty.

To migrate an existing story whose `characters.json` predates the slug ID, run:

```powershell
.\.venv\Scripts\python.exe scripts\backfill_relationship_ids.py
```

It walks every story's `characters.json` on disk AND the `story_files` rows in `manga_registry.sqlite`, idempotent and safe to re-run.

### Manga Script per-chapter snapshots + Generate All (added 2026-05-07)

`chapter_script.json` only ever holds ONE chapter at a time. The only safe way to script every chapter is generate → approve (which calls `version_service.create_simple_snapshot`) → next. The `⚡ Generate All` button on the script page implements exactly that loop in `chapter_number` order, with a cancel-after-current-step ref. Don't add parallel generation here — version history would race.

### Phase status freshness (added 2026-05-07)

`StudioShell` re-fetches `/stories/{id}/status` on every `pathname` change. Without this, locks computed at first mount stay stale even after the user fills in the prerequisites that would unlock the next phase. If a user reports "Manga Script is locked but I have everything", first ask them to click any other studio tab and back — the refetch fires automatically.

### Export gate

Export unlocks at `plot_outline: completed` (chapters + structure exist). Visual exports are self-gated inside the export page on `hasScriptData`, so users can pull Story Doc / Scenes / Raw JSON immediately after Plot Board even before any chapter is scripted.

### RequestValidationError handler

`apps/api/app/main.py` has a custom `RequestValidationError` handler that returns Pydantic detail in the standard envelope (`error.code = "VALIDATION_ERROR"`, `error.message` is a `field: msg; field: msg` summary, `error.details` is the full Pydantic detail array). The frontend `apiFetch` reads `error.message`, so 422s now show actionable text instead of `API error 422`.

### Source Files for Context

- `progress` file in repo root: full chronological changelog of every change made
- `RUN-COMMANDS.md`: canonical run commands, troubleshooting, file locations, SQLite path

## API Conventions

- Base path: `/api/v1/`
- All responses: `{ "ok": true, "data": {}, "error": null }`
- Error handler: `MangaMakerError` → `manga_error_handler` in `app/core/errors.py`
- Routers mounted in `app/main.py`

## Frontend Phase Gating

15 studio screens grouped into 6 stages. The relationship web (`/web`) unlocks only after 2+ major character profiles exist (enforced via CharacterService). Side characters do NOT count toward this threshold. See `lib/phases.ts` for the full route map.

State: Zustand store (`lib/store.ts`). API client: `lib/api.ts` (48 methods). Types: `lib/types.ts` (defines `ApiEnvelope<T>` response shape).

## Key File Locations

| Concern | Path |
|---------|------|
| FastAPI entrypoint | `integrated/.../apps\api\app\main.py` |
| Pydantic models | `integrated/.../apps\api\app\models\` |
| Business logic (15 services) | `integrated/.../apps\api\app\services\` |
| REST endpoints (62 total) | `integrated/.../apps\api\app\api\v1\` |
| DB connections | `integrated/.../apps\api\app\db\postgres.py` |
| SQLite registry | `integrated/.../apps\api\storage\manga_registry.sqlite` |
| Story file storage | `integrated/.../apps\api\storage\stories\` |
| Story templates | `integrated/.../apps\api\app\templates\` |
| Frontend routes | `integrated/.../apps\web\app\studio\[storyId]\` |
| 6 Stage nav | `integrated/.../apps\web\lib\phases.ts` |
| Stage-grouped StudioShell | `integrated/.../apps\web\components\studio\StudioShell.tsx` |

## What NOT to Do

- Never edit story JSON files directly — always go through the event/approval flow.
- Never assume Neo4j/Qdrant are running — code has fallbacks, don't break them.
- Don't start with all services enabled at once — get basic app running first.
- Don't commit `.env` files or ZIP archives (`.gitignore` covers these).
- Don't modify `memory_system.json` template — it's frozen per version.
- Don't re-wire the dead Extract Events pipeline (`story_events`/`json_patches`).
- Don't add loose copies of the six story-template JSONs to the repo root — the canonical templates are at `integrated/.../apps/api/app/templates/`. The 2026-05-07 cleanup deleted the loose duplicates and updated `.gitignore` accordingly.

## Detailed Docs

| Doc | Path |
|-----|------|
| Architecture overview | `docs/architecture.md` |
| Backend API reference + 62 endpoints | `docs/backend-guide.md` |
| Frontend 15 screens + components | `docs/frontend-guide.md` |
| PostgreSQL schema (18 tables) | `docs/database-schema.md` |
| Full changelog | `progress` (repo root) |
| Run commands + troubleshooting | `RUN-COMMANDS.md` |

<!-- n8n-as-code-start -->
<!-- n8nac-version: 2.1.2 -->

## n8n-as-code Context Root

This file is generated by `npx --yes n8nac update-ai`. It is bootstrap context only, not a configuration source of truth.

- Context root: `c:\story-novel-making-from-scrach\v2.1`
- n8n version at generation time: Unknown
- n8nac command: `npx --yes n8nac`
- n8n-manager command: `npx --yes @n8n-as-code/n8n-manager`
- n8n knowledge command: `npx --yes n8nac skills`

Run workspace commands from this context root. Do not `cd` into the n8n-as-code source repository, n8n-manager source repository, plugin directory, or package directory to run `npx --yes n8nac workspace ...`, `npx --yes n8nac list`, `npx --yes n8nac pull`, `npx --yes n8nac push`, or `npx --yes n8nac update-ai`.

---

## Required Local Agent

A VS Code and GitHub Copilot-compatible agent is generated here:

- `.github/agents/n8n-architect.agent.md`

A portable skill fallback is also generated for runtimes that do not read `.github/agents`:

- `.agents/skills/n8n-architect/SKILL.md`

If your agent runtime supports workspace agents, use the `.github/agents/*.agent.md` file. If it supports skills instead, load the skill file. Otherwise, treat these files as mandatory instructions.

---

## Source Of Truth

Do not infer configuration from this file. It intentionally avoids storing the effective instance, project, sync folder, or workflow directory.

n8nac backend resolution remains the only source of effective workspace state.
- Workspace environments live in `n8nac-config.json` and are managed by `npx --yes n8nac env ...`.
- Managed local runtime state and secrets live in n8n-manager storage and are managed by `npx --yes @n8n-as-code/n8n-manager ...`.
- The effective context is resolved by the backend.

Before any n8n workflow command, run migration dry-run first, then workspace status only after migration is not required or has been applied:

```bash
cd c:\story-novel-making-from-scrach\v2.1
npx --yes n8nac workspace migrate --json
npx --yes n8nac workspace status --json
```

Use the returned `workflowDir` exactly as provided. Do not reconstruct paths from raw config files.

---

## Safe Commands

- Primary workspace, environment, sync, validation, push, and pull work: `npx --yes n8nac ...`
- Local managed runtime lifecycle and tunnels only: `npx --yes @n8n-as-code/n8n-manager ...`
- Workspace status and migration: `npx --yes n8nac workspace ...`
- Workflow sync and validation: `npx --yes n8nac ...`
- Node knowledge and schema lookup: `npx --yes n8nac skills ...`

Never write `n8nac-config.json`, `~/.n8n-manager`, or n8n-manager secret files by hand.
<!-- n8n-as-code-end -->
