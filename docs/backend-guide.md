# Backend Guide

## Overview

The backend is a FastAPI-based story-state engine. It manages six JSON story files through an event-driven pipeline with versioned snapshots, PostgreSQL registry, Neo4j graph projections, and Qdrant vector memory.

## Project Structure

```
app/
├── main.py                    # FastAPI app entry point
├── main_dependencies.py       # Shared dependency injection
├── __init__.py
│
├── api/v1/                    # REST API endpoints
│   ├── __init__.py
│   ├── auth.py                # Auth endpoints (/api/v1/auth/*)
│   ├── stories.py             # Story CRUD + status
│   ├── master_story.py        # Master story template/state
│   ├── characters.py          # Character profiles + relationship map
│   ├── plot_outline.py        # Plot planning (arcs, chapters, scenes)
│   ├── plot_workspace.py      # Free writing → approval flow
│   ├── chapter_script.py      # Manga script generation
│   ├── versions.py            # Version bundles
│   ├── continuity.py          # Continuity checking
│   ├── events.py              # Event store queries
│   ├── graph.py               # Neo4j projections
│   ├── vector.py              # Qdrant memory upserts
│   └── llm.py                 # LLM status + runs log
│
├── core/                      # Core utilities
│   ├── __init__.py
│   ├── config.py              # Settings from env vars
│   ├── auth.py                # Auth middleware, API key validation
│   ├── errors.py              # Custom exception handlers
│   └── ids.py                 # ID generation (story_001, char_001, etc.)
│
├── db/                        # Database connections
│   ├── __init__.py
│   ├── postgres.py            # SQLAlchemy async engine + session
│   ├── neo4j.py               # Neo4j driver connection
│   ├── qdrant.py              # Qdrant client connection
│   └── redis.py               # Redis client (background workers)
│
├── models/                    # Pydantic models
│   ├── __init__.py
│   ├── api.py                 # Standard response envelope
│   ├── enums.py               # StateType, FileType, EventCategory, etc.
│   ├── files.py               # LinkedFiles validator
│   └── (various)              # Per-file Pydantic models
│
├── services/                  # Business logic
│   ├── __init__.py
│   ├── story_service.py       # Create/load stories
│   ├── snapshot_service.py    # Versioned JSON snapshots
│   ├── template_state_service.py  # Template vs story state tracking
│   ├── master_story_service.py    # World/faction/threat management
│   ├── character_service.py     # Character profiles + relationship map
│   ├── plot_outline_service.py  # Plot planning management
│   ├── plot_workspace_service.py  # Free writing → approval pipeline
│   ├── chapter_script_service.py  # Manga script generation
│   ├── llm_service.py         # AI completion, consequence extraction
│   ├── event_service.py       # Official event creation (append-only)
│   ├── patch_service.py       # JSON patch application
│   ├── validation_service.py  # Schema + reference validation
│   ├── continuity_service.py  # Contradiction detection
│   ├── version_service.py     # Version bundle creation
│   ├── graph_service.py       # Neo4j event projection
│   ├── vector_service.py      # Qdrant memory upserts
│   └── retrieval_service.py   # Multi-source story context retrieval
│
├── repositories/              # Data access layer
│   ├── __init__.py
│   ├── sqlite_registry.py     # Dev registry (smoke test fallback)
│   └── (SQLAlchemy repos for production)
│
├── templates/                 # Six JSON file templates
│   ├── master_story.json
│   ├── characters.json
│   ├── plot_outline.json
│   ├── memory_system.json
│   ├── plot_workspace.json
│   └── chapter_script.json
│
└── workers/                   # Background task workers
    ├── graph_projection_worker.py
    ├── vector_projection_worker.py
    ├── sync_worker.py
    └── continuity_worker.py
```

## API Endpoints Reference

### Health & Status

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Service health check |
| GET | `/api/v1/llm/status` | LLM provider status |
| GET | `/api/v1/llm/runs` | Recent LLM run log |

### Stories

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/stories` | Create story (creates v001 + 6 template files) |
| GET | `/api/v1/stories/{story_id}` | Get story metadata |
| GET | `/api/v1/stories/{story_id}/status` | Story status + phase progress |
| GET | `/api/v1/stories/{story_id}/current-version` | Current version info |
| GET | `/api/v1/stories/{story_id}/files/current` | Current file set |

### Master Story

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stories/{id}/master-story` | Get master story content |
| PATCH | `/stories/{id}/master-story/template` | Patch template fields (pre-story_state) |
| POST | `/stories/{id}/master-story/validate` | Validate against schema |

### Characters

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stories/{id}/characters` | Get characters file |
| PATCH | `/stories/{id}/characters/structure` | Set main character structure (single/dual/ensemble) |
| POST | `/stories/{id}/characters/profiles` | Create a character profile |
| POST | `/stories/{id}/characters/relationship-map/activate` | Enable relationship map (requires 2+ profiles) |
| POST | `/stories/{id}/characters/relationships` | Create a relationship between characters |

### Plot Outline

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stories/{id}/plot-outline` | Get plot outline |
| PATCH | `/stories/{id}/plot-outline/story-start-workflow` | Set workflow mode |
| PATCH | `/stories/{id}/plot-outline/narrative-structure` | Choose Kishotenketsu/Three-Act/etc. |
| PATCH | `/stories/{id}/plot-outline/arc-overview` | Define arcs |
| POST | `/stories/{id}/plot-outline/chapters` | Create chapters |
| POST | `/stories/{id}/plot-outline/scenes` | Create scene cards |

### Plot Workspace (Core Flow)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/stories/{id}/plot-workspace` | Create new workspace for arc/chapter |
| PATCH | `/.../free-writing` | Save free writing text |
| POST | `/.../ai-complete` | Run AI expansion on text |
| POST | `/.../ai-complete/decision` | Accept/reject/edit AI completion |
| POST | `/.../analyze` | Detect consequences from final text |
| GET | `/.../questions` | Get consequence questions |
| POST | `/.../questions/{id}/answer` | Answer a question |
| GET | `/.../confirmation` | Get final confirmation summary |
| POST | `/.../approve` | Approve all changes → creates events + patches + v002 |
| POST | `/.../reject` | Reject workspace changes |

### Chapter Script

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stories/{id}/chapter-script` | Get current chapter script |
| POST | `/stories/{id}/chapter-script/generate` | Generate manga script from workspace |
| PATCH | `/stories/{id}/chapter-script` | Patch specific panel/page/scene |
| POST | `/stories/{id}/chapter-script/extract-events` | Extract story events from finished script |
| POST | `/stories/{id}/chapter-script/approve` | Approve chapter script for memory update |

### Versions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/stories/{id}/versions` | List all versions |
| GET | `/stories/{id}/versions/{vid}` | Get version details |
| GET | `/stories/{id}/versions/{vid}/manifest` | Get version manifest (file list) |
| POST | `/stories/{id}/versions/create-from-approved-events` | Create new version from approved events |
| POST | `/stories/{id}/versions/{vid}/mark-official` | Mark version as official |

### Continuity

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/stories/{id}/continuity/check-current` | Check current state for contradictions |
| POST | `/stories/{id}/continuity/check-version` | Check candidate version |
| GET | `/stories/{id}/continuity/reports` | Get continuity reports |

### Graph (Neo4j)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/stories/{id}/graph/project-events` | Project approved events into Neo4j |
| GET | `/stories/{id}/graph/projections` | List graph projections |
| GET | `/stories/{id}/graph/status` | Graph sync status |

### Vector (Qdrant)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/stories/{id}/vector/upsert-current-memory` | Upsert vector chunks for current version |
| GET | `/stories/{id}/vector/chunks` | List vector chunk metadata |
| GET | `/stories/{id}/vector/status` | Vector sync status |

### Database

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/db/migration-info` | Check Alembic migration artifact paths |

## Response Format

All endpoints return:

```json
{
  "ok": true,
  "data": { ... },
  "error": null
}
```

Error responses:

```json
{
  "ok": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "character_relationship_map must be disabled until at least 2 profiles exist",
    "details": {}
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MANGA_AUTH_ENABLED` | `false` | Enable API key auth |
| `MANGA_DEV_API_KEY` | — | API key for dev mode |
| `MANGA_LLM_ENABLED` | `false` | Enable LLM integration |
| `MANGA_LLM_PROVIDER` | `openai` | LLM provider name |
| `MANGA_OPENAI_API_KEY` | — | OpenAI API key |
| `MANGA_OPENAI_MODEL` | `gpt-4.1-mini` | Model to use |
| `MANGA_OPENAI_BASE_URL` | `https://api.openai.com/v1` | Base URL for LLM API |

## Running the Backend

### Development (smoke test — no PostgreSQL required)

```bash
python tests/smoke_test.py
```

### Full development server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Production migration

```bash
alembic upgrade head
```

## Key Validation Rules (Enforced)

1. `plot_outline.json` filename is hardcoded — cannot be changed to `plot_outline(1).json` or similar
2. Relationship map (`characters.json`) starts disabled and empty; Pydantic validator rejects activation with < 2 profiles
3. All linked files must reference official filenames only
4. Template state allows direct patches; story state requires events for changes
5. Version bundles are synchronized — all 4 official files written on every version
