# Manga Maker System Integrated Bundle v1.3

This bundle combines:

- `apps/api` — Backend (62 endpoints, 15 services, 16 routers)
- `apps/web` — Frontend (15 screens, 12 components, 6 stages)
- Graph + Vector + LLM optional integrations

## Quick Start

### Backend

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd apps/web
npm install
cp .env.example .env.local
npm run dev
```

Open: http://localhost:3000

### Smoke Test

```bash
cd apps/api && .venv\Scripts\activate && python tests\smoke_test.py
```

Expected: `"passed": true` (73 checks)

---

## What's Included

### Backend (62 endpoints)

- Story CRUD, status, current files, manifests
- Master story: genre, factions, threats, world rules
- Characters: structure, major profiles (7-tab, 150+ fields), side profiles (auto-ID), relationship map
- Plot outline: narrative structure (4 types), arc overview, chapters, scenes
- Plot workspace: free writing, AI completion, consequence analysis, Q&A, approval
- Events + patches: create, list, approve
- Versions: list, get, create candidate, mark official (auto-syncs graph/vector/continuity)
- Chapter script: generate, patch, extract events, approve, validate
- Continuity: check current/version, list reports
- Graph: project events, list projections, merged JSON+Neo4j web graph, status
- Vector: upsert memory chunks, list chunks, status
- LLM: AI completion, consequence extraction, field-level AI generation, references
- Auth: me endpoint, dev/api-key modes, story ownership

### Frontend (15 screens, 6 stages)

| Stage | Screens |
|-------|---------|
| Foundation | Studio Home, Story Seed, World Core |
| Characters | Cast Forge, Side Cast, Relationship Web |
| Plot | Plot Board, Scene Cards, Plot Threads |
| Write | Writing Desk, Consequence Court |
| Produce | Manga Script |
| Review | Memory Timeline, Continuity Radar, Control Room |

### Infrastructure

- 6 clean JSON templates (no suffix names)
- SQLite registry for dev/testing
- PostgreSQL schema (18 tables) + Alembic migrations
- Neo4j graph projection with local fallback
- Qdrant vector storage with deterministic embeddings
- LLM with OpenAI-compatible API support + deterministic fallback

---

## Graph + Vector Integrations

This bundle includes real optional connectors for Neo4j and Qdrant:

- **Graph web endpoint**: `GET /api/v1/stories/{story_id}/graph/web` — returns merged characters.json data as nodes/edges for frontend visualization
- **Neo4j event projection**: `POST /graph/project-events` → stores as `event_projections`
- **Qdrant vector upsert**: `POST /vector/upsert-current-memory` → creates `vector_chunks`
- **Local fallback**: When Neo4j/Qdrant are disabled, services store local metadata logs

| Endpoint | Description |
|----------|-------------|
| `GET /graph/status` | Neo4j connection status |
| `POST /graph/project-events` | Project events to graph |
| `GET /graph/projections` | List graph projections |
| `GET /graph/web` | Merged character graph for frontend |
| `GET /vector/status` | Qdrant connection status |
| `POST /vector/upsert-current-memory` | Upsert memory chunks |
| `GET /vector/chunks` | List vector chunks |

---

## Local Auth

By default, backend uses dev mode with `dev_user`. The frontend sends `X-Manga-User-Id=dev_user`.

For API-key mode, set `MANGA_AUTH_ENABLED=true` and `MANGA_DEV_API_KEY=your-key`.

---

## Design Rule

The frontend never edits raw official memory directly. It calls backend APIs. The backend owns JSON snapshots, events, patches, versions, and validation.

---

## Docker Compose

From this directory:

```bash
docker compose up --build    # API :8000, Web :3000, Neo4j :7474/:7687, Qdrant :6333
```
