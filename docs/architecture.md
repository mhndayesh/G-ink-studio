# System Architecture

## Overview

Manga Maker System is an AI-assisted manga story engine with event-driven memory management. It combines versioned JSON state, relational databases (PostgreSQL), graph databases (Neo4j), and vector search (Qdrant) to maintain story continuity across chapters and arcs.

## Core Principles

1. **Story-state engine, not CRUD** — The system tracks narrative state transitions through events, not simple create/update/delete operations.
2. **Versioned snapshots** — Every approved change creates a new synchronized version bundle. Old versions are immutable.
3. **Event-sourced memory** — All official changes go through an append-only event store. State is reconstructed from events.
4. **LLM proposes, user confirms** — The LLM never directly edits official files. It generates proposals; the system validates; the user approves.
5. **Simple frontend, strict backend** — Users interact with guided screens. All business logic and validation lives in the backend.

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                          │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │         Next.js Frontend (Studio Flow)              │     │
│  │                                                     │     │
│  │  Seed → World → Cast → Web → Board → Desk → Court   │     │
│  │       → Script → Timeline → Radar → Control         │     │
│  └──────────────────┬──────────────────────────────────┘     │
└─────────────────────┼────────────────────────────────────────┘
                      │ REST API (/api/v1) — JSON
                      ▼
┌──────────────────────────────────────────────────────────────┐
│                       SERVICE LAYER                          │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Story    │ │ Snapshot │ │ Version  │ │ Character    │   │
│  │ Service  │ │ Service  │ │ Service  │ │ Service      │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Plot     │ │ LLM      │ │ Event    │ │ Patch        │   │
│  │ Workspace│ │ Service  │ │ Service  │ │ Service      │   │
│  │ Service  │ │          │ │          │ │              │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ Chapter  │ │ Continuity│ │ Graph    │ │ Vector       │   │
│  │ Script   │ │ Service  │ │ Service  │ │ Service      │   │
│  │ Service  │ │          │ │ (Neo4j)  │ │ (Qdrant)     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                              │
│  ┌──────────┐ ┌──────────┐                                  │
│  │ Validation│ │ Template │                                  │
│  │ Service  │ │ State Svc│                                  │
│  └──────────┘ └──────────┘                                  │
└──────┬─────────┬──────────┬──────────┬─────────────────────┘
       │         │          │          │
       ▼         ▼          ▼          ▼
┌─────────┐ ┌────────┐ ┌────────┐ ┌──────────┐
│PostgreSQL│ │ Neo4j  │ │ Qdrant │ │ File     │
│(Registry)│ │ (Graph)│ │ (Vector)│ │ Storage  │
└─────────┘ └────────┘ └────────┘ └──────────┘
```

## Data Flow: The Writing Workspace Pipeline

This is the central user workflow that drives the entire system.

```
User writes free text
        │
        ▼
┌───────────────┐     ┌───────────────┐
│  Free Writing  │────▶│   AI Expand   │ (optional)
│  (workspace)   │     │               │
└───────────────┘     └───────┬───────┘
                              │ user accepts/rejects
                              ▼
                       ┌───────────────┐
                       │  Analyze      │
                       │  Consequences │
                       └───────┬───────┘
                               │
                               ▼
                        ┌───────────────┐
                        │ Detected      │
                        │ Events +      │
                        │ Questions     │
                        └───────┬───────┘
                                │ user answers
                                ▼
                         ┌───────────────┐
                         │ Final         │
                         │ Confirmation  │
                         └───────┬───────┘
                                 │ user approves
                                 ▼
                    ┌────────────────────────┐
                    │ Backend creates:       │
                    │ • story_events (append)│
                    │ • json_patches         │
                    │ • v002 snapshot bundle │
                    │ • Neo4j projections    │
                    │ • Qdrant vector chunks │
                    │ • continuity report    │
                    └────────────────────────┘
```

## File System Layout

### Official Story Files (versioned)

Each version creates a synchronized bundle of these files:

| File | Storage | Description |
|------|---------|-------------|
| `master_story.json` | File storage + JSONB in SQL | World foundation, rules, factions, threats |
| `characters.json` | File storage + JSONB in SQL | Character bible, relationship map |
| `plot_outline.json` | File storage + JSONB in SQL | Official plot plan (arcs, chapters, scenes) |
| `memory_system.json` | File storage only | Persistence rules, event definitions, sync config |

### Working Files (ephemeral)

| File | Storage | Description |
|------|---------|-------------|
| `plot_workspace.json` | File storage + path in SQL | Temporary free writing, AI expansion, detected events |
| `chapter_script.json` | File storage + path in SQL | Clean manga script output (scenes → pages → panels) |

### Version Bundles

```
/stories/{story_id}/versions/v001/
  ├── master_story.json
  ├── characters.json
  ├── plot_outline.json
  ├── memory_system.json
  └── version_manifest.json

/stories/{story_id}/versions/v002/
  ├── master_story.json    (patched)
  ├── characters.json      (patched)
  ├── plot_outline.json
  ├── memory_system.json   (updated events)
  └── version_manifest.json
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js App Router, React, TypeScript | Dynamic Studio Flow UI |
| **Styling** | Tailwind CSS + shadcn/ui | Utility-first component library |
| **State** | TanStack Query (server) + Zustand (local) | Data fetching and local UI state |
| **Backend** | FastAPI (Python 3.12+) | REST API, Pydantic validation |
| **Relational DB** | PostgreSQL 16 | Story registry, events, patches, workspaces |
| **Graph DB** | Neo4j 5 | Character/faction/location relationships |
| **Vector DB** | Qdrant | Semantic story memory (lore, summaries) |
| **Cache/Queue** | Redis | Background workers, caching |
| **Storage** | Local filesystem / S3-compatible | JSON snapshot bundles |
| **Migrations** | Alembic | PostgreSQL schema migrations |

## Versioning Model

```
v001 (template_state) ──▶ user fills setup ──▶ v002 (story_state)
                                                    │
                                              writes + approves
                                                    ▼
                                               v003, v004, ...
```

- **template_state**: Initial state. Files contain empty/default values. Edits are direct patches without events.
- **story_state**: User has filled meaningful content. All changes require approved events.
- Versions are synchronized bundles — if one file changes, all official files are written to the new version folder.

## Event Categories

| Category | Example Events |
|----------|---------------|
| `character_events` | CHARACTER_CREATED, CHARACTER_INJURED, CHARACTER_DIED, CHARACTER_ALLEGIANCE_CHANGED |
| `relationship_events` | RELATIONSHIP_CREATED, RELATIONSHIP_TRUST_CHANGED, RELATIONSHIP_BETRAYAL |
| `power_events` | POWER_GAINED, POWER_LOST, POWER_EVOLVED |
| `world_events` | WORLD_RULE_CHANGED, LOCATION_DESTROYED, STORY_FOUNDATION_SHIFTED |
| `faction_events` | FACTION_JOINED, FACTION_LEFT, FACTION_ALLIED, FACTION_AT_WAR |
| `threat_events` | THREAT_REVEALED, THREAT_DEFATED, THREAT_ESCALATED |
| `plot_events` | CHAPTER_COMPLETED, PLOT_CHANGES_CONFIRMED, ARC_FINISHED |
| `system_events` | VERSION_CREATED, WORKSPACE_APPROVED |

## Continuity Checking

The continuity service runs after every approval and checks for:

- Dead character appearing alive without flashback or revive event
- Destroyed location used as normal active location
- Lost power used without power recovery event
- Relationship state contradicting relationship map
- Faction behavior contradicting faction goals
- World rule violation without WORLD_RULE_CHANGED event
- Master story changed without an event
- Future version memory leaking into previous versions
- Mixed version files used together
- Graph projection missing after approved event
- Vector memory missing after major scene

## Security Model

- **Dev mode**: `MANGA_AUTH_ENABLED=false` — permissive, uses `dev_user`
- **API key mode**: `MANGA_AUTH_ENABLED=true` — requires `X-Manga-API-Key` header
- Story ownership: Each story has a `user_id`. All `/stories/{id}/...` routes verify ownership.
