# Manga Maker System

AI-assisted manga story engine with stage-gated authoring, per-chapter version snapshots, and multi-store memory (PostgreSQL / SQLite registry, Neo4j, Qdrant).

## What This Is

A full story-state engine for creating manga stories. Users move through a 6-stage studio (Foundation → Characters → Plot → Write → Produce → Review). Every official change goes through a save/version flow rather than a direct LLM overwrite, and chapter scripts get snapshotted into version history on approval.

**Core rule:** Simple frontend. Strict backend. Versioned snapshots. The LLM never directly edits official memory — it proposes only.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend (Next.js)                          │
│   Foundation → Characters → Plot → Write → Produce → Review     │
│   Studio Home · Seed · World · Cast · Side · Web · Board ·      │
│   Scenes · Threads · Desk · Court · Script · Export · Timeline ·│
│   Radar · Control                                               │
└──────────────────────┬──────────────────────────────────────────┘
                       │ REST /api/v1
┌──────────────────────▼──────────────────────────────────────────┐
│                     Backend (FastAPI, port 8080)                │
│  StoryService · SnapshotService · VersionService                │
│  CharacterService · PlotOutlineService · PlotWorkspaceService   │
│  ChapterScriptService · LLMService · ContinuityService          │
│  GraphService · VectorService · ValidationService               │
└──┬──────────────┬──────────────────┬──────────────┬─────────────┘
   ▼              ▼                  ▼              ▼
SQLite          Neo4j              Qdrant       File storage
(registry +     (character /       (semantic    (per-version
 working files) faction graph)     memory)      JSON snapshots)
```

The integrated bundle ships a SQLite-backed registry by default; PostgreSQL is supported via the same migrations but isn't required for local dev. Neo4j and Qdrant degrade to deterministic local fallbacks when their containers aren't running.

## Six Official Story Files

Canonical templates live at `apps/api/app/templates/`.

| File | Purpose | Mutation path |
|------|---------|---------------|
| `master_story.json` | World, factions, threats, story foundation | Patches via Master Story Service |
| `characters.json` | Major + side profiles + relationship map | Patches via Character Service |
| `plot_outline.json` | Narrative structure, arc overview, chapters, scenes, plot threads | Patches via Plot Outline Service |
| `plot_workspace.json` | Free writing + AI expansion + consequence questions | Workspace flow (Writing Desk → Court) |
| `chapter_script.json` | Manga script for ONE chapter at a time (pages → panels) | Generate → approve → version snapshot |
| `memory_system.json` | Frozen per-version metadata | Read-only template |

## Six-Stage Studio Flow

| Stage | Screens | Unlock |
|-------|---------|--------|
| **Foundation** | Studio Home · Story Seed · World Core | Always (Home); Seed unlocks at start; World needs Seed completed |
| **Characters** | Cast Forge · Side Cast · Relationship Web | Cast needs World; Side needs ≥1 major; Web needs ≥2 majors |
| **Plot** | Plot Board · Scene Cards · Plot Threads | Board needs Characters; Scenes/Threads need ≥1 chapter + structure |
| **Write** | Writing Desk · Consequence Court | Desk needs Characters; Court needs workspace analyzed |
| **Produce** | Manga Script · Export | Script unlocks once threads + chapters + scenes exist; Export at Plot Board completion |
| **Review** | Memory Timeline · Continuity Radar · Control Room | Always available |

Every page that triggers an AI call also gates the AI button on its own prerequisites (e.g. Plot Board AI requires arc length + narrative structure; Plot Threads AI requires arc overview filled; Court AI requires ≥1 question).

## AI Generation Patterns

- **Generate Fields panel** (`AiFillPanel`) on Board / Cast / Side / Threads / Scenes / Court / Desk: pick which fields to generate, click once, results auto-apply to the form.
- **Plot Board flow:** Step 1 Arc Overview → Step 2 Structure Plan → Step 3 Chapters. Narrative structure and arc length are saved live the moment the user picks them so the LLM sees them in the very next call.
- **Scene Cards:** "Recommend counts" suggests a per-chapter scene total + must-cover beats. Each recommendation has a per-chapter `Apply (+N)` button that creates scene placeholders seeded with the suggested beats; `Apply All` runs the same across every chapter.
- **Manga Script `⚡ Generate All`:** iterates remaining chapters in `chapter_number` order, calling generate → approve → next so each chapter is preserved in version history before the next one overwrites the working slot. Cancel-after-current-step is one click.
- **Plot Threads ID dropdowns:** `relationship_id`, `character_id`, `threat_id_or_name` are dropdowns sourced from `/ai/references`, with stable slug-based IDs (`rel_<slugA>__<slugB>`). The LLM service backfills missing IDs server-side from text content before the response leaves the API.

## Quick Start (Windows / LM Studio)

> **Port:** Backend runs on **8080** (port 8000 is taken by `open-notebook` on this workstation). Frontend `.env.example` is pre-configured for 8080.

```powershell
# Backend (FastAPI)
cd apps\api
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# edit .env: set MANGA_LLM_ENABLED=true and point at LM Studio
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080
```

```powershell
# Frontend (Next.js, new terminal)
cd apps\web
npm install
copy .env.example .env.local
npm run dev
```

> **Do NOT use bare `uvicorn` or `--reload` on Windows** — bare `uvicorn` can resolve to system Python instead of the venv, and `--reload` serves stale bytecode. After backend edits: kill the process, delete `__pycache__`, restart fresh. Full troubleshooting in [RUN-COMMANDS.md](RUN-COMMANDS.md).

Open http://localhost:3000 and create a story.

### LM Studio (default LLM)

1. Load a model in LM Studio and start its local server (default `http://localhost:1234`).
2. In `apps/api/.env`:
   ```
   MANGA_LLM_ENABLED=true
   MANGA_OPENAI_BASE_URL=http://localhost:1234/v1
   MANGA_OPENAI_API_KEY=lm-studio
   MANGA_OPENAI_MODEL=local-model
   ```
3. Confirm: `python -c "import httpx; print(httpx.get('http://localhost:8080/api/v1/llm/status').json())"`

Any OpenAI-compatible endpoint works (LM Studio, llama.cpp, vLLM, OpenAI cloud).

### Optional: Neo4j + Qdrant

Without them the system runs in deterministic-fallback mode (graph kept in SQLite, vectors hashed locally). Bring them up only when you need real graph/vector behaviour:

```powershell
cd infra
docker compose up -d
```

| Env var | Default | Effect when `false` |
|---------|---------|---------------------|
| `MANGA_LLM_ENABLED` | true (after `.env` setup) | AI buttons return deterministic placeholder output |
| `MANGA_GRAPH_ENABLED` | true | Graph projections kept in SQLite fallback only |
| `MANGA_VECTOR_ENABLED` | true | Vector chunks hashed locally instead of stored in Qdrant |

### Smoke test

```powershell
cd apps\api
.\.venv\Scripts\python.exe tests\smoke_test.py
```

Expected: `"passed": true`.

## Repository Structure

```
.
├── README.md                  # This file — overview + quick start
├── AGENTS.md                  # Contributor / agent runbook (port 8080, gotchas)
├── CLAUDE.md                  # Detailed dev guide (architecture, services, conventions)
├── RUN-COMMANDS.md            # Canonical run / troubleshooting commands
├── WORKFLOW.md                # End-to-end authoring workflow
├── CHANGELOG.md               # Notable changes
├── docker-compose.yml         # Full stack (api + web + neo4j + qdrant)
├── apps/
│   ├── api/                   # FastAPI backend (port 8080)
│   │   ├── app/               # routers (api/v1), services, models, core, templates
│   │   ├── migrations/        # Alembic migrations
│   │   ├── scripts/           # one-shot maintenance scripts (backfills)
│   │   ├── tests/             # smoke_test.py
│   │   ├── infra/postgres/    # schema.sql
│   │   └── requirements.txt
│   └── web/                   # Next.js frontend (port 3000)
│       ├── app/studio/[storyId]/   # studio screens
│       ├── components/        # AiFillPanel, StudioShell, ...
│       ├── lib/               # api.ts, phases.ts, store.ts, aiResults.ts, ...
│       └── package.json
├── infra/                     # docker-compose for Neo4j + Qdrant only
├── docs/                      # architecture, backend/frontend guides, db schema,
│                              # ai-field-schema, ASSET-FORMAT-SPEC, EXPORT-TOOL-REQUIREMENTS,
│                              # SIMPLE-FLOW-PROPOSAL, REPO-CRITIQUE
└── QA/                        # test plan, bug report, perf notes, risky areas
```

> Earlier revisions nested everything under `integrated/manga_maker_integrated_v1_2/`;
> that layer has been removed. There are no separate `backend/` or `frontend/` legacy
> folders any more — `apps/api` and `apps/web` are the only source trees.

## API Conventions

- Base path: `/api/v1/`
- All envelope responses: `{ "ok": true, "data": <payload>, "error": null }`
- Errors raised as `MangaMakerError` are mapped to `{ ok: false, error: { code, message } }` by `manga_error_handler` ([core/errors.py](apps/api/app/core/errors.py)).
- Pydantic validation failures (422) return the same envelope with `error.code = "VALIDATION_ERROR"` and a human-readable summary plus the full detail array under `error.details`.
- Auth: every request must carry `X-Manga-User-Id` (dev default: `dev_user`).

## Key Design Decisions

- **Per-chapter version snapshots on Manga Script approve**, not on Writing Desk approve. Approving a chapter writes the entire current state into version history before the next chapter overwrites the working slot.
- **`chapter_script.json` is single-chapter at a time.** The Generate All flow respects this by approving each chapter into history before moving on, so chapter N-1 is in version history when chapter N is being scripted.
- **Stable relationship IDs.** Relationships use `rel_<slugA>__<slugB>` IDs derived from the canonical `characters_involved` pair. The LLM context shows these IDs and the server backfills them into AI thread responses if the model omits them.
- **LM Studio first, cloud optional.** The LLM client is OpenAI-compatible and pointed at a local LM Studio endpoint by default.
- **Stage-gated UI.** The frontend reads `phase_status` from `/stories/{id}/status` on every route change and locks downstream phases until prerequisites are met. Tooltips on locked phases surface the actual API blockers (e.g. `plot_threads_empty`, `no_scenes`).
- **Deterministic fallbacks** for LLM, graph, and vector services keep the app usable for development without external services.

## Build Phases

| Phase | Deliverables | Status |
|-------|-------------|--------|
| 0 — Project Setup | Monorepo, Docker Compose, FastAPI/Next.js skeletons | Done |
| 1 — File + Version Foundation | Six template JSONs, snapshot service, version manifest | Done |
| 2 — Story Setup | Master story APIs, Seed/World Core | Done |
| 3 — Character Builder | Profile queue, relationship map gate | Done |
| 4 — Plot Board | Narrative structure + arc length live-save, structured AI flow | Done |
| 5 — Writing Workspace | Free writing → AI completion → consequence analysis → reviewed | Done |
| 6 — Chapter Script | Per-chapter generation, approve → version snapshot, Generate All batch | Done |
| 7 — Graph + Vector | Neo4j projection, Qdrant chunks, continuity reports | Done |
| 8 — Auth & Ownership | User ownership, API keys, story isolation | In progress |

Detailed changelog: [`CHANGELOG.md`](CHANGELOG.md).

## Project status

This is a **local, single-user development tool**, not a hardened multi-tenant
service. In particular: auth is off by default and, when on, is a single shared
API key mapped to one user (`dev_user`); the rate limiter is in-memory per-process;
there is no multi-tenant story isolation beyond that. Don't expose the API to
untrusted networks. See [`docs/REPO-CRITIQUE.md`](docs/REPO-CRITIQUE.md) for the
full assessment and the cleanup roadmap.

## License

Internal project — all rights reserved.
