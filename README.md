# G-Ink Studio

A manga and novel creation studio — write your story, let AI help shape it, then export production-ready assets for your artist.

---

## Quick Start (Docker)

```bash
git clone https://github.com/mhndayesh/G-ink-studio.git
cd G-ink-studio

# Optional: enable real AI — copy and fill in your API key
cp .env.example .env

docker compose up --build
```

Open **http://localhost:3000** — the studio is running.

First build takes 3–5 minutes (Next.js compiles). Subsequent starts are fast.

> **No LLM key?** Every AI button still works — the system returns deterministic fallback output so you can explore the full workflow without an API key.

---

## What it does

G-Ink Studio is a structured story engine built around six canonical JSON files. You fill them in stage by stage — the system detects consequences, asks questions, and locks in approved changes as immutable version snapshots. The LLM proposes; you confirm.

**19 screens across 6 stages:**

| Stage | Screens |
|-------|---------|
| Foundation | Home · Story Seed · World Core |
| Characters | Cast Forge · Side Cast · Relationship Web · Faction Visuals |
| Plot | Plot Board · Scene Cards · Plot Threads · Locations |
| Write | Writing Desk · Consequence Court |
| Produce | Manga Script · Visuals Studio · Writing Desk · Export |
| Review | Memory Timeline · Continuity Radar · Control Room |

**AI integration:** every form field has an AI-fill button. The Writing Desk sends free text through an LLM that extracts consequences and proposes structured changes — you approve or discard each one.

**Export:** download your story as `.md`, `.txt`, `.docx`, or as a production ZIP bundle (visual reference, panels CSV, per-character sheets, AI image prompts for each character).

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

SQLite is used by default for local dev. Neo4j and Qdrant degrade gracefully to local fallbacks when their containers aren't reachable.

---

## Services

| Service | Port | Purpose |
|---------|------|---------|
| Frontend (Next.js) | 3000 | Studio UI |
| Backend (FastAPI) | 8080 | REST API + LLM |
| Neo4j | 7474 / 7687 | Character relationship graph |
| Qdrant | 6333 | Vector memory search |

Story data is persisted in `./storage/` (Docker volume — safe across restarts).

---

## Using a local LLM

Point the studio at any OpenAI-compatible endpoint (LM Studio, Ollama, llama.cpp, vLLM):

```env
# .env
MANGA_LLM_ENABLED=true
MANGA_OPENAI_API_KEY=lm-studio   # any non-empty string
MANGA_OPENAI_BASE_URL=http://host.docker.internal:1234/v1
MANGA_OPENAI_MODEL=your-model-name
```

`host.docker.internal` resolves to your host machine from inside Docker on Mac/Windows. On Linux use your machine's LAN IP instead.

---

## Local development (no Docker)

**Requirements:** Python 3.12+, Node 20+

```powershell
# Backend
cd apps\api
python -m venv .venv
pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080

# Frontend (new terminal)
cd apps\web
npm install
copy .env.example .env.local
npm run dev
```

See [RUN-COMMANDS.md](RUN-COMMANDS.md) for full troubleshooting and smoke test instructions.

---

## Tech stack

**Backend:** Python · FastAPI · SQLite / PostgreSQL · Neo4j · Qdrant · python-docx

**Frontend:** Next.js 15 · React 19 · TypeScript · Tailwind CSS · TanStack Query · Zustand · Framer Motion

---

## Docs

- [RUN-COMMANDS.md](RUN-COMMANDS.md) — all dev commands
- [WORKFLOW.md](WORKFLOW.md) — the story creation workflow
- [docs/architecture.md](docs/architecture.md) — system design
- [docs/backend-guide.md](docs/backend-guide.md) — full endpoint map
- [docs/frontend-guide.md](docs/frontend-guide.md) — all 19 screens
- [CHANGELOG.md](CHANGELOG.md) — what changed

---

## Project status

Local single-user tool — not production-hardened. Auth is off by default. Do not expose the API to untrusted networks.

## License

All rights reserved.
