# Contributing

This is an internal project (all rights reserved — no open-source license).
The notes below are for anyone (human or agent) working in the repo.

## Layout

- `apps/api` — FastAPI backend (port **8080**).
- `apps/web` — Next.js frontend (port **3000**).
- `infra/` — docker-compose for Neo4j + Qdrant only.
- `docker-compose.yml` (root) — full stack.
- `docs/` — architecture, guides, schema, specs, [`REPO-CRITIQUE.md`](docs/REPO-CRITIQUE.md).
- `QA/` — test plan, bug report, perf/risk notes.
- Read `AGENTS.md` and `CLAUDE.md` first — they hold the hard-won context (dead
  pipelines, AI-flow gates, version-snapshot timing, the `--reload` gotcha, …).

## Running

See [`RUN-COMMANDS.md`](RUN-COMMANDS.md). Short version:

```bash
# backend
cd apps/api && python -m venv .venv && . .venv/Scripts/activate   # or source .venv/bin/activate
pip install -r requirements.txt && cp .env.example .env
python -m uvicorn app.main:app --port 8080        # do NOT use --reload

# frontend (new terminal)
cd apps/web && npm ci && cp .env.example .env.local && npm run dev
```

## Before you push

Run what CI runs (see `.github/workflows/ci.yml`):

- Backend: `cd apps/api && python -m pytest` — runs `tests/unit/*` plus
  `tests/test_smoke.py` (the end-to-end workflow, in-process via TestClient — no
  server/Neo4j/Qdrant/LLM needed). `python tests/smoke_test.py` also still works
  standalone and prints a JSON report (`"passed": true` on success).
- Frontend: `cd apps/web && npm run lint && npm test && npm run build && npm run smoke`
  (`npm test` = `vitest run`).

## Conventions

- API responses use the envelope `{ "ok": bool, "data": ..., "error": {code,message}|null }`.
- The LLM **proposes**, the user **confirms** — never mutate the six story JSON
  files directly; go through the services / approval flow.
- Always use the canonical filenames (`plot_outline.json`, never `plot_outline(1).json`).
- Don't relax the AI-flow gates (see `AGENTS.md`) without a reason — "AI did
  nothing" was the most-reported bug before they existed.
- Commit `package-lock.json`. Don't commit `.env`, `storage/`, build caches, or
  scratch reports (`.gitignore` covers these).
- Land work as discrete commits with a clear message; don't let a large
  uncommitted backlog pile up.

## Known issues / roadmap

[`docs/REPO-CRITIQUE.md`](docs/REPO-CRITIQUE.md) is the running assessment:
god modules to split (`llm_service.py`, `chapter_script_service.py`,
`export.py`, `apps/web/app/studio/[storyId]/board/page.tsx`), the frontend
`any` cleanup, missing unit tests, the stub auth/rate-limiter, and the
two-competing-designs product question (staged studio vs. the "Auto" flow).
