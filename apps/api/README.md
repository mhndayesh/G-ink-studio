# Manga Maker Backend

FastAPI backend for the Manga Maker System story-state engine. Runs on **port 8080** (see [`../../RUN-COMMANDS.md`](../../RUN-COMMANDS.md)).

## Overview

- FastAPI app — routers under `app/api/v1/`, services under `app/services/` (see those dirs for the current list rather than a count that drifts).
- SQLite dev registry for local use / smoke tests; PostgreSQL via Alembic migrations (`migrations/`), schema also in `infra/postgres/schema.sql`.
- Optional Neo4j (graph) and Qdrant (vector) integrations, each with a deterministic local fallback when the service isn't running.

### Official filenames

```
master_story.json
characters.json
plot_outline.json
memory_system.json
plot_workspace.json
chapter_script.json
```

No uploaded suffix names like `characters(6).json` or `plot_outline(7).json`.

---

## Complete Endpoint List

```text
### health
GET   /api/v1/health

### auth
GET   /api/v1/auth/me

### stories
POST  /api/v1/stories
GET   /api/v1/stories
DELETE /api/v1/stories/{story_id}
GET   /api/v1/stories/{story_id}/status
GET   /api/v1/stories/{story_id}/files/current
GET   /api/v1/stories/{story_id}/versions/{version_id}/manifest

### master-story
GET   /api/v1/stories/{story_id}/master-story
PATCH /api/v1/stories/{story_id}/master-story/template
POST  /api/v1/stories/{story_id}/master-story/validate

### characters
GET   /api/v1/stories/{story_id}/characters
POST  /api/v1/stories/{story_id}/characters/validate
PATCH /api/v1/stories/{story_id}/characters/structure
POST  /api/v1/stories/{story_id}/characters/profiles
POST  /api/v1/stories/{story_id}/characters/side-profiles
POST  /api/v1/stories/{story_id}/characters/relationship-map/activate

### plot-outline
GET   /api/v1/stories/{story_id}/plot-outline
POST  /api/v1/stories/{story_id}/plot-outline/validate
PATCH /api/v1/stories/{story_id}/plot-outline/story-start-workflow
PATCH /api/v1/stories/{story_id}/plot-outline/narrative-structure
PATCH /api/v1/stories/{story_id}/plot-outline/arc-overview
POST  /api/v1/stories/{story_id}/plot-outline/chapters
POST  /api/v1/stories/{story_id}/plot-outline/scenes

### plot-workspace
GET   /api/v1/stories/{story_id}/plot-workspace
POST  /api/v1/stories/{story_id}/plot-workspace/validate
PATCH /api/v1/stories/{story_id}/plot-workspace/free-writing
POST  /api/v1/stories/{story_id}/plot-workspace/ai-complete
POST  /api/v1/stories/{story_id}/plot-workspace/ai-complete/decision
POST  /api/v1/stories/{story_id}/plot-workspace/analyze
GET   /api/v1/stories/{story_id}/plot-workspace/questions
POST  /api/v1/stories/{story_id}/plot-workspace/questions/{question_id}/answer
GET   /api/v1/stories/{story_id}/plot-workspace/confirmation
POST  /api/v1/stories/{story_id}/plot-workspace/approve

### events + patches
GET   /api/v1/stories/{story_id}/events
GET   /api/v1/stories/{story_id}/patches
POST  /api/v1/stories/{story_id}/events/from-approved-workspace

### versions
GET   /api/v1/stories/{story_id}/versions
GET   /api/v1/stories/{story_id}/versions/{version_id}
POST  /api/v1/stories/{story_id}/versions/create-from-approved-events
POST  /api/v1/stories/{story_id}/versions/{version_id}/mark-official

### chapter-script
GET   /api/v1/stories/{story_id}/chapter-script
POST  /api/v1/stories/{story_id}/chapter-script/validate
POST  /api/v1/stories/{story_id}/chapter-script/generate
PATCH /api/v1/stories/{story_id}/chapter-script
POST  /api/v1/stories/{story_id}/chapter-script/extract-events
POST  /api/v1/stories/{story_id}/chapter-script/approve

### continuity
POST  /api/v1/stories/{story_id}/continuity/check-current
POST  /api/v1/stories/{story_id}/continuity/check-version
GET   /api/v1/stories/{story_id}/continuity/reports

### graph
POST  /api/v1/stories/{story_id}/graph/project-events
GET   /api/v1/stories/{story_id}/graph/projections
GET   /api/v1/stories/{story_id}/graph/web
GET   /api/v1/stories/{story_id}/graph/status

### vector
POST  /api/v1/stories/{story_id}/vector/upsert-current-memory
GET   /api/v1/stories/{story_id}/vector/chunks
GET   /api/v1/stories/{story_id}/vector/status

### llm
GET   /api/v1/llm/status
GET   /api/v1/llm/runs

### db
GET   /api/v1/db/migration-info

### ai
POST  /api/v1/stories/{story_id}/ai/generate
GET   /api/v1/stories/{story_id}/ai/references
```

---

## Key New Endpoints (v1.3)

- `POST /characters/side-profiles` — Create side character with auto-ID
- `GET /graph/web` — Merged character graph from JSON data
- `POST /ai/generate` — Field-level AI generation across all pages
- `GET /ai/references` — Cross-page reference data (characters, factions, threats, chapters)
- Version auto-creation on approve (no separate step needed)

---

## Run smoke test

```bash
python tests/smoke_test.py
```

Expected: `"passed": true` (73 checks)

---

## Auth / User Ownership

- `GET /api/v1/auth/me` resolves current user
- Story ownership enforced on all `{story_id}` routes
- Dev mode: `MANGA_AUTH_ENABLED=false` (default)
- API-key mode: `MANGA_AUTH_ENABLED=true` + `MANGA_DEV_API_KEY`

See `docs/AUTH.md`.
