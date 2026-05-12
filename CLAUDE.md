# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development Commands

### Backend (apps/api)
```powershell
cd apps\api
# First time
python -m venv .venv
pip install -r requirements.txt
copy .env.example .env

# Run — always use the explicit venv Python; do NOT use bare uvicorn or --reload
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080

# Smoke test (run after backend changes)
.\.venv\Scripts\python.exe tests\smoke_test.py
```

### Frontend (apps/web)
```powershell
cd apps\web
npm install
copy .env.example .env.local
npm run dev         # http://localhost:3000
npm run lint        # ESLint
npm run smoke       # node scripts/smoke-check.mjs
```

### Full stack
```powershell
docker compose up --build   # Web :3000, API :8080 (local), Neo4j :7474, Qdrant :6333
```

---

## Architecture Overview

This is a **manga/novel creation studio** — a monorepo with a Python FastAPI backend and a Next.js frontend. The system is structured as an **event-sourced story engine**: story data lives in 6 canonical JSON files, every user change produces an auditable event, and approved events create immutable version snapshots.

### The 6 Story JSON Files

Every story has exactly these files (one set per version snapshot):

| File | Purpose |
|---|---|
| `master_story.json` | Title, idea, genres, ending, world type, factions, threats, rules |
| `characters.json` | Major profiles (7 tabs, 150+ fields each), side profiles, relationship map |
| `plot_outline.json` | Narrative structure, arc overview, chapters, scene cards, locations, plot threads |
| `memory_system.json` | System-generated, frozen per version — never edited directly |
| `plot_workspace.json` | Ephemeral: free writing, AI expansion, Q&A state |
| `chapter_script.json` | Pages → panels → dialogue, SFX, visual descriptions |

The SQLite registry (`storage/manga_registry.sqlite`) caches JSON copies for quick lookup and tracks story/version/file metadata. Files are also stored on disk at `storage/stories/<story_id>/<version_id>/`.

### Backend: `apps/api`

**Entry:** `app/main.py` — FastAPI with CORS, rate limiting, request logging middleware.

**17 routers** in `app/api/v1/`. Key ones:
- `ai.py` — Universal field-level generation (`POST /ai/generate`); most AI calls go through here
- `locations.py` — Location CRUD + `POST /ai-fill` and `POST /ai-generate-all` endpoints
- `chapter_script.py` — Generate/patch/approve the chapter script; unlock status
- `plot_outline.py` / `characters.py` / `master_story.py` — CRUD for the core story files
- `plot_workspace.py` — Free writing, AI expansion, consequence analysis, approval flow
- `events.py` / `versions.py` — Event creation, version candidate creation, mark official

**Key services** in `app/services/`:
- `llm_service.py` — All LLM calls. Has a **deterministic fallback** if no API key is set. Uses `generate_fields(page, target_fields, partial_input, context, generation_hints)` as the universal field-fill method. Returns `{"generated": {...}, "generated_fields": {...}, "warnings": [...], "used_fallback": bool}`.
- `chapter_script_service.py` — Script generation from chapter data. Requires: plot outline exists + ≥1 meaningful chapter. Scene cards and plot threads are **optional enrichment** (synthesised from chapter if absent).
- `story_service.py` — Computes `phase_statuses` dict for the frontend unlock system. Keys include: `master_story`, `characters`, `plot_outline`, `locations`, `scene_cards`, `chapter_script`, `plot_workspace`, `integrity_locked`, etc.
- `snapshot_service.py` — Creates v001 bundles from templates; handles file I/O.

**API response envelope:**
```json
{ "ok": true, "data": { ... } }
{ "ok": false, "data": null, "error": { "code": "...", "message": "..." } }
```

### Frontend: `apps/web`

**Next.js App Router.** All studio pages live under `app/studio/[storyId]/`.

**6 stages, 19 pages** (in unlock order):
- **Foundation:** `home` → `seed` → `world`
- **Characters:** `cast` → `side` → `web` → `faction-visuals`
- **Plot:** `board` → `scenes` → `threads` → `locations`
- **Write:** `court` (Consequence Court)
- **Produce:** `script` → `visuals-studio` → `desk` → `export`
- **Review:** `timeline` → `radar` → `control`

**Phase/unlock system** (`lib/phases.ts`):
- Each phase has `unlockRequirements: Record<string, "completed" | "available">`.
- Keys are checked against `phaseStatuses` from `GET /stories/{id}/status` (computed by `story_service._compute_phase_status`).
- `"completed"` requires `actual === "completed"`; `"available"` requires `actual !== "locked"`.
- Current critical gates: Manga Script + Visuals Studio + Export all require `locations: "completed"` (at least one named location) + `plot_outline: "completed"`.

**API client** (`lib/api.ts`): ~40 methods; sends `x-user-id` and `x-api-key` headers. All calls proxy to `NEXT_PUBLIC_API_BASE_URL`.

**AI result handling** (`lib/aiResults.ts`): `unwrapGeneratedFields(data)` looks for `data?.generated_fields ?? data`. `getUsableAiOutput()` throws if the result is empty.

**State:** Zustand store (`lib/store.ts`) holds `phaseStatuses` and `integrityLock` globally.

---

## LLM Integration

All LLM calls go through `LLMService` in `app/services/llm_service.py`.

**Required env vars to enable real LLM:**
```
MANGA_LLM_ENABLED=true
MANGA_LLM_PROVIDER=openai
MANGA_OPENAI_API_KEY=sk-...
MANGA_OPENAI_MODEL=gpt-4.1-mini
MANGA_OPENAI_BASE_URL=https://api.openai.com/v1   # or local LLM endpoint
MANGA_LLM_TIMEOUT_SECONDS=60
```

Without a key, every AI call silently returns deterministic fallback output — the app stays fully functional.

`generate_fields()` is the core method — called by every AI-fill endpoint. It selects a page-specific system prompt, builds a context message (per-page instruction builder), calls the LLM, and normalises the output. The return dict always has both `"generated"` and `"generated_fields"` keys pointing to the same value (both are used by different callers).

For `page="locations"` with `target_fields=["locations"]`, the LLM must return `{ "locations": [...] }`. The bulk generate endpoint reads `result.get("generated_fields").get("locations", [])`.

---

## Data Flow: Writing a Chapter Script

1. **Plot Board** → user creates arc + chapters → `plot_outline.json` has `narrative_structure.selected` + `chapter_or_episode_list.chapters[]`
2. **Locations** → user adds named locations → `plot_outline.json` has `locations.locations[]` with `name` set → `locations: "completed"` unlocks Manga Script
3. **Manga Script** → `POST /chapter-script/generate?chapter_id=ch_001` → `ChapterScriptService.generate_from_workspace()` → synthesises a scene from chapter data if no scene cards exist → builds pages (one page per scene, 5 panels each) → saves to `chapter_script.json`
4. **Approve** → `POST /chapter-script/approve` → events extracted → `VersionService` creates candidate v002
5. **Mark Official** → candidate becomes the new frozen snapshot; graph/vector/continuity sync

---

## Storage Layout

```
apps/api/
  storage/
    manga_registry.sqlite          ← SQLite dev registry (gitignored)
    stories/
      story_001/
        versions/
          v001/
            master_story.json
            characters.json
            plot_outline.json
            memory_system.json
            plot_workspace.json
            chapter_script.json
            version_manifest.json
  app/
    templates/                     ← Canonical blank templates for each JSON file
```

---

## Key Constraints & Conventions

- **`plot_threads` and `scene_cards` are optional** before generating a script. `ChapterScriptService` synthesises a fallback scene from chapter data when scenes are absent. These were once hard requirements but were intentionally relaxed.
- **Location data** is stored inside `plot_outline.json` at `content.locations.locations[]`, not in a separate table. `LocationService` reads/writes that nested path.
- **`generate_fields()` return shape** — always returns `{"generated": x, "generated_fields": x, "warnings": [...], "used_fallback": bool}`. Endpoint callers must use `result.get("generated_fields")`, not `result.get("generated")` (though both work now).
- **`chapter_script` status** is `"locked"` only when: no plot outline OR no meaningful chapters OR integrity lock engaged. Threads and scenes no longer block it.
- **All AI endpoints** that write data first fetch full story context (`master_story`, `characters`, `plot_outline`) from the registry and pass it to `generate_fields()` as `context`.
- **STAGES indices** in `lib/phases.ts` must stay in sync with the array order returned by `phases()`. Write stage is index 11 (1 item: court). Produce stage is indices 12–15 (script, visuals-studio, desk, export).
