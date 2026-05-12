# G-Ink Studio

A structured manga and novel creation studio. Write your story stage by stage, use AI to fill in any field, and export a complete production bundle — panel breakdowns, per-character AI image prompts, and formatted scripts — ready to hand to your artist.

---

## Quick Start

```bash
git clone https://github.com/mhndayesh/G-ink-studio.git
cd G-ink-studio

# Optional — enable real AI: copy .env.example to .env and add your API key
cp .env.example .env

docker compose up --build
```

Open **http://localhost:3000**

First build takes 3–5 minutes (Next.js compiles). Subsequent starts are under 30 seconds.

> **No API key?** Every AI button still works. The system ships with deterministic fallback output so you can explore the full 19-screen workflow without any external service.

---

## What makes it different

Most AI writing tools give you a chat box. G-Ink Studio gives you a structured pipeline:

- **Stage-gated workflow** — 19 screens unlock in order. You cannot skip character creation to write a script; the system enforces the creative dependencies that make stories coherent.
- **AI proposes, you confirm** — no destructive overwrites. Every AI suggestion goes through an approval step. You can discard, edit, or accept field by field.
- **Versioned snapshots** — every approved chapter writes an immutable version to history. Roll back any time.
- **Works offline** — all AI features degrade gracefully to deterministic output. No API key required to use the full studio.
- **Any OpenAI-compatible LLM** — OpenAI, Anthropic-compatible proxies, LM Studio, Ollama, llama.cpp, vLLM. One env var to switch.
- **Artist-ready export** — production ZIP with a full visual reference doc, panels CSV (one row per panel for spreadsheet workflows), per-character Stable Diffusion / Midjourney prompts, and character reference sheets.

---

## The six stages

| Stage | Screens | What you build |
|-------|---------|----------------|
| Foundation | Home · Seed · World | Title, genre, world rules, factions, threats |
| Characters | Cast · Side Cast · Relationship Web · Faction Visuals | Major + side character profiles, relationship map, faction visual signatures |
| Plot | Board · Scenes · Threads · Locations | Arc overview, chapters, scene cards, plot threads, named locations |
| Write | Writing Desk · Consequence Court | Free writing → AI extracts consequences → you approve changes |
| Produce | Script · Visuals Studio · Export | Per-chapter manga script, visual descriptions, formatted exports |
| Review | Timeline · Radar · Control | Version history, continuity checks, raw API access |

---

## Using AI

Every form field has an **AI Fill** button. Select the fields you want generated, click Generate, review the output, apply.

The Writing Desk is more powerful: write freely, then hit **Detect Consequences**. The LLM reads your text against the existing story state, extracts what changed (character arcs, faction loyalties, world rules), turns them into structured questions, and waits for you to answer each one before committing anything.

---

## Export formats

| Format | Contents |
|--------|----------|
| Story `.md` / `.txt` / `.docx` | Full narrative: world, characters, arc, all chapter scripts |
| Scenes `.md` | Scene cards with embedded dialogue |
| Visuals `.md` | Per-chapter panel breakdown with camera shots and visual descriptions |
| Visuals bundle `.zip` | `visuals.md` + `panels.csv` + `character_sheets/` + `prompts/` |
| G-Ink triple `.zip` | The three asset files + validation report for import into G-Ink Studio |
| Raw `.zip` | All six canonical JSON files (backup / migration) |

---

## LLM setup

**OpenAI / cloud:**
```env
# .env
MANGA_LLM_ENABLED=true
MANGA_OPENAI_API_KEY=sk-...
MANGA_OPENAI_MODEL=gpt-4.1-mini
```

**Local model (LM Studio, Ollama, etc.):**
```env
MANGA_LLM_ENABLED=true
MANGA_OPENAI_API_KEY=local          # any non-empty string
MANGA_OPENAI_BASE_URL=http://host.docker.internal:1234/v1
MANGA_OPENAI_MODEL=your-model-name
```

`host.docker.internal` resolves to your host machine from inside Docker on Mac/Windows. On Linux use your machine's local IP address.

---

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Frontend (Next.js) | 3000 | Studio UI |
| Backend (FastAPI) | 8080 | REST API + LLM |
| Neo4j | 7474 / 7687 | Character relationship graph |
| Qdrant | 6333 | Vector memory search |

Story data persists in `./storage/` (Docker volume — survives restarts and rebuilds).

---

## Local development (no Docker)

**Requirements:** Python 3.12+, Node 20+

```bash
# Backend
cd apps/api
python -m venv .venv
pip install -r requirements.txt
cp .env.example .env          # Windows: copy .env.example .env

# Mac/Linux
source .venv/bin/activate
uvicorn app.main:app --port 8080

# Windows
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080
```

```bash
# Frontend (new terminal)
cd apps/web
npm install
cp .env.example .env.local    # Windows: copy .env.example .env.local
npm run dev
```

See [RUN-COMMANDS.md](RUN-COMMANDS.md) for smoke tests and troubleshooting.

---

## Architecture

```
┌──────────────────────────────────────────────┐
│         Frontend (Next.js, port 3000)        │
│   19 screens · TanStack Query · Zustand      │
└──────────────────┬───────────────────────────┘
                   │ REST /api/v1
┌──────────────────▼───────────────────────────┐
│         Backend (FastAPI, port 8080)         │
│   17 routers · LLMService · SnapshotService  │
└──┬───────────┬──────────────┬────────────────┘
   ▼           ▼              ▼
 SQLite      Neo4j          Qdrant
 (registry)  (graph)        (vector)
```

Neo4j and Qdrant both degrade to local fallbacks when not running — the studio stays fully functional without them.

---

## Tech stack

**Backend:** Python 3.12 · FastAPI · SQLite / PostgreSQL · Neo4j · Qdrant · python-docx

**Frontend:** Next.js 15 · React 19 · TypeScript · Tailwind CSS · TanStack Query · Zustand · Framer Motion

---

## Docs

| Doc | Contents |
|-----|----------|
| [RUN-COMMANDS.md](RUN-COMMANDS.md) | All dev commands, smoke test, troubleshooting |
| [WORKFLOW.md](WORKFLOW.md) | End-to-end story creation walkthrough |
| [docs/architecture.md](docs/architecture.md) | System design and data flow |
| [docs/backend-guide.md](docs/backend-guide.md) | Full endpoint map (17 routers) |
| [docs/frontend-guide.md](docs/frontend-guide.md) | All 19 screens with descriptions |
| [CHANGELOG.md](CHANGELOG.md) | What changed |

---

## Status & license

Single-user local tool. Auth is disabled by default — do not expose port 8080 to the internet.

All rights reserved.
