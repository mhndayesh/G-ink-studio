# Repo Critique — Manga Maker System (v2.1)

_Date: 2026-05-12 · Scope: whole repository (structure, git hygiene, backend, frontend, docs, testing, product direction)._

This is a working AI manga-story engine: FastAPI backend (~96 route handlers, 16 services, 18 routers) + Next.js 15 frontend (15+ studio screens), with optional Neo4j / Qdrant / LLM integrations and deterministic fallbacks. The core ideas (versioned snapshots, "LLM proposes, user confirms", stage-gated authoring) are sound and the backend layering is clean. The problems are mostly around **repo hygiene, accumulated cruft, doc drift, untracked work, oversized modules, missing tests/CI, and an unresolved product direction.**

---

## Cleanup status (branch `cleanup/repo-hygiene`)

Much of this has been actioned on the `cleanup/repo-hygiene` branch — see [`../CHANGELOG.md`](../CHANGELOG.md). In short:

- **Done:** repo flattened (`integrated/manga_maker_integrated_v1_2/` removed), cruft deleted (`archive/`, `.agents/`, `.n8nac/`, stray DBs, duplicate compose/requirements), working tree committed, `package-lock.json` committed; docs reconciled (paths, the `uvicorn --reload`/port-8000 contradiction, drifted counts) + a "Project status — local single-user tool" notice; `.github/workflows/ci.yml` added (backend `pytest`; frontend lint + `vitest` + build + smoke); `CHANGELOG.md`/`CONTRIBUTING.md` added; the visual-prompt policy (one fixed `black and white Japanese manga style` prefix, short visual-only sanitiser) + **all BUNDLE-AUDIT items #1–#8** mitigated at the export layer + LLM-schema level; **five backend god modules decomposed** (`export.py` 1689→265 +`export_service.py`; `llm_service.py` 1894→1529 +`thread_ids.py`/`llm_prompts.py`/`llm_context.py`; `chapter_script_service.py` 1783→1623 +`script_patch.py`; shared content predicates +`content_inspector.py`); a **`pytest` suite (41 tests)** + a **`vitest` suite (8 tests)** added; a first frontend extraction (`board/page.tsx` 1295→1226 +`boardModel.ts`). Backend `python -m pytest`, frontend `npm run lint`/`npm test`/`npm run build`/`npm run smoke` all green.
- **Still TODO** (left deliberately — each is large and/or risky to do well in a no-review pass): the deeper `board/page.tsx` decomposition (split the ~40 `useState` per-section sub-forms + the two modals into components/hooks); replace the frontend's pervasive `any` with typed API responses; finish decomposing `generate_fields` in `llm_service.py` (~620 lines); converge the three *non-identical* `_apply_patch` copies onto `script_patch.py` (needs op-by-op verification); decide the staged-studio-vs-`auto`-flow product question; broaden tests (more service coverage; frontend component tests — `vitest` is in place, just add `@testing-library/react`).

---

## 1. Git hygiene — the biggest single problem

- **One commit ("Initial project import") and ~50 uncommitted changes** (32 modified tracked files + ~20 untracked new files/dirs, including whole new features). There is no history, no ability to review changes, no bisect, no traceability. Commit the working tree in logical chunks now, and don't let it pile up again.
- **Significant features live entirely outside git** (untracked): `apps/web/app/studio/[storyId]/auto/`, `visuals-studio/`, `faction-visuals/`, `locations/`, `apps/web/lib/autoPilot.ts` (675 lines), `apps/api/app/api/v1/locations.py`, `apps/api/app/services/{location_service,context_pack_service}.py`, `apps/api/migrate_backfill.py`, `apps/api/scripts/backfill_locations_and_visuals.py`, `integrated/.../{CLAUDE.md,WORKFLOW.md}`. Either commit or delete — right now it's unreviewable.
- No branch protection / PR flow / CI gate (see §6).

## 2. Directory structure & cruft

**Nesting:** code lives at `apps/{api,web}/...` — four directory levels (one of which hard-codes "v1_2" while the README *inside* it says "v1.3"). Flatten to `apps/api` + `apps/web` (or `backend/` + `frontend/`) at repo root.

**Files/dirs that should not be here:**

| Item | Why it's a problem |
|---|---|
| `NUL` (root) | Windows null-device artifact — a single BrowserStack-MCP log line written to `NUL`. Delete. |
| `story_003_latest_bundle.zip` (root) | 69 KB export artifact sitting in the tree (gitignored, but clutters the workdir). |
| `manga_registry.sqlite` (root) **and** `integrated/.../manga_registry.sqlite` | Two 0-byte stray DB files; plus the real ones under `apps/api/storage/` (`manga_maker.db`, `manga_registry.sqlite`). Four scattered DB files. |
| `.venv/` (root) | A second virtualenv in addition to `apps/api/.venv/`. |
| `.playwright-mcp/` | 30+ console/page dump files from MCP browser sessions (gitignored but huge on-disk clutter). |
| `archive/` (committed!) | 9 old design docs / smoke reports (`codes.md`, `codes-v2.md` ~50 KB each, `*_report.json`, `correction_manifest.json`). Archive material belongs on a tag/branch, not the live tree. |
| `.agents/skills/n8n-architect/`, `.github/agents/n8n-architect.agent.md`, `.n8nac/ai-context.json` | "n8n architect" automation cruft — nothing to do with a manga story engine. Remove, or document why it's here. |
| `apps/api/.pytest_cache/`, `apps/web/.next/`, `tsconfig.tsbuildinfo`, `**/__pycache__/` | On-disk build/test caches. `.gitignore` is missing `.pytest_cache/`. |

**Duplicates that need a single source of truth:**

- **Two `docs/` trees** — root `docs/{architecture,backend-guide,database-schema,frontend-guide}.md` and `integrated/.../docs/` with the *same names but different content*. Which is authoritative? Keep one.
- **Three `docker-compose.yml`** — `integrated/.../docker-compose.yml` (full stack, API on 8000), `integrated/.../infra/docker-compose.yml` (just Neo4j+Qdrant, with healthchecks), `integrated/.../apps/api/docker-compose.yml` (near-duplicate of the first). The `apps/api` one is dead; consolidate.
- **Two `requirements.txt`** — root and `apps/api/`. They disagree: the root one adds `neo4j`, `python-docx`; the `apps/api` one omits them. Neither lists a Qdrant client (the code talks to Qdrant over HTTP via `httpx` — fine, but undocumented). Pick one file, pin versions (or adopt a lock tool).
- **`package-lock.json` is gitignored.** For an application you want the lockfile *committed* for reproducible installs.

## 3. Documentation — contradictory and drifting

- Root `README.md`: "Manga Maker System", path `manga_maker_integrated_v1_2`, backend **port 8080**, "**do NOT** use bare `uvicorn` or `--reload`".
- `integrated/.../README.md`: titled "Integrated Bundle **v1.3**", and the quick-start says `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` — directly contradicts the root README, `AGENTS.md`, and `RUN-COMMANDS.md`, *and* uses the wrong port. It also claims "62 endpoints, 15 services, 16 routers" while `main.py` mounts **18 routers**, the services dir has **16**, and there are **~96 route handlers**. Counts have drifted.
- The intended workflow is described in **at least three incompatible places**: `AGENTS.md` (6 official files, 6-stage / 15-screen studio), `WORKFLOW.md` (429 lines), and `simple.md` (a stub of unstructured notes — "iadea>ai expantion>world brife..." — arguing for a *collapsed* flow with the LLM filling JSON in real time and far fewer UI steps). The new untracked `auto/` page + `autoPilot.ts` look like a half-built implementation of the `simple.md` vision, reflected in *no* committed doc. Decide the product, then write **one** design doc.
- Missing: `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`, and an honest **"Status / not production-ready"** section (the README sells "PostgreSQL — production target" while auth, rate limiting, and multi-tenancy are stubs — see §4).
- `apps/web/docs/API_ENDPOINTS_USED.md` is a hand-maintained endpoint list that will drift; FastAPI already serves OpenAPI — commit `openapi.json` and/or generate a typed TS client instead.

## 4. Backend

**Strengths:** clean layering (`api/v1` routers → services → `sqlite_registry`), consistent `{ok, data, error}` envelope, structured request logging, `RequestValidationError`/`IntegrityError`/generic exception handlers, Alembic migrations, deterministic fallbacks when LLM/Neo4j/Qdrant are absent, no `print()` debugging, no bare `except:`.

**Issues:**

- **God modules.** `llm_service.py` (1893 lines), `chapter_script_service.py` (1783), `export.py` (1689 — and it's a *router*, not a service!), `plot_outline_service.py` (824), `plot_workspace_service.py` (707), `character_service.py` (698). Split: per-format exporters, per-section prompt builders, smaller domain services. `export.py` in particular should move its DOCX/zip/asset-spec logic into a service and keep the route thin.
- **Auth is a placeholder.** Default `MANGA_AUTH_ENABLED=false`; even when enabled it's a *single shared API key* mapped to one `dev_user` (the code comments admit multi-tenant isn't built). `require_story_access` exists but ownership is only meaningful in dev mode, where the caller can spoof `X-Manga-User-Id`. In the shipped default config, anyone who reaches the API owns every story. Acceptable for a local tool — but it must be stated loudly, and the README's "production target" framing is misleading.
- **Rate limiter is a toy.** `RateLimitMiddleware._buckets` is a class-level in-memory dict: doesn't survive multiple workers, never evicts idle IPs (slow memory leak), and 100/60 s is hard-coded and unconfigurable. For real multi-user use, move to Redis; otherwise drop it.
- **CORS:** `allow_credentials=True` + `allow_methods=["*"]` + `allow_headers=["*"]`. It works because origins are explicit, but credentials-plus-wildcards is a smell; restrict to the methods/headers actually used.
- **`get_settings()` has import-time side effects** (`lru_cache` + `mkdir`). Surprising and test-hostile.
- **21 `except Exception:` blocks.** The fallback pattern (LLM/graph/vector) is deliberate, but audit the rest — broad catches hide real failures.
- **Ad-hoc migrations outside Alembic:** `migrate_backfill.py`, `scripts/backfill_locations_and_visuals.py`, `scripts/backfill_relationship_ids.py`, `scripts/check_migration_artifacts.py`. Backfills should be Alembic data migrations, or at minimum documented one-shots with run conditions.
- **Hard-coded dev creds in source/compose:** `database_url` default `manga:manga@localhost`, Neo4j `manga_maker_password` repeated in `.env`, `.env.example`, and the compose files. Fine for local; document it and don't let it leak into a "prod" path.
- No visible pagination/limits on list endpoints; no metrics/error monitoring beyond the request-log middleware.

## 5. Frontend

**Strengths:** modern stack (Next 15 / React 19 / TanStack Query / Zustand / Tailwind), ESLint configured, clear screen-per-stage layout, reusable form components (`AiFillPanel`, `OptionGrid`, `Field`, …).

**Issues:**

- **`board/page.tsx` is 1295 lines with ~40+ `useState` hooks in one component** (`ki/sho/ten/ketsu`, `act1/act2/act3`, several modals, multiple AI-result buckets, delete targets, rel proposals, …). Unmaintainable. Extract per-section sub-forms, use a reducer or `react-hook-form`, and pull AI flows into custom hooks. Same shape in `scenes/page.tsx` (750), `visuals-studio/page.tsx` (662), `world/page.tsx` (607), `desk/page.tsx` (436), `threads/page.tsx` (461), `script/page.tsx` (538).
- **Pervasive `any`** — `aiPlot: any`, `aiBoardResults: Record<string, any>`, `hasContent(value: any)`, `isMeaningfulChapter(chapter: any)`, etc. `lib/types.ts` (127 lines) is clearly incomplete. Generate types from the backend Pydantic models (or hand-write a real API client) and delete the `any`s.
- **`console.log` / `console.error` left throughout source.** Add a thin logger or strip before any real deployment.
- **No frontend tests.** Only `scripts/smoke-check.mjs`. No Vitest/Jest, no committed Playwright specs — despite `.playwright-mcp` session dumps existing on disk.
- **15+ studio screens for "an average user who just wants to make stories."** This directly contradicts `simple.md`'s stated top priority ("minimize UI steps"). The current 6-stage / 15-screen studio is the "strict" version that the project's own notes call too heavy. Resolve this (see §7).

## 6. Testing & CI

- **No CI at all.** `.github/` contains only an agent definition — no `workflows/`. Lint, build, and smoke tests are never run automatically. Add a GitHub Actions workflow: backend `python tests/smoke_test.py` + `pytest`; frontend `npm run lint` + `npm run build` + `npm run smoke`.
- **No unit tests.** `pytest` is a dependency but the only "tests" are two procedural smoke scripts (`apps/api/tests/smoke_test.py` 721 lines, `apps/api/smoke_test_workflow.py` 73 lines) that hit a *running* server. Services aren't tested in isolation; the frontend isn't tested at all.
- **QA artifacts exist but are static.** `QA/{BUG_REPORT,PERFORMANCE_REPORT,RISKY_AREAS,SECURITY_NOTES,TEST_PLAN,REPRO_STEPS}.md` are good to have, but they're prose, not executable, and `SECURITY_NOTES.md` has a "CRITICAL" section — confirm those issues are actually fixed (the auth/rate-limit findings above suggest some aren't).

## 7. Product direction (the meta-issue)

The repo is visibly split between two designs:

1. **The "strict" one** (committed): 6 official JSON files, 6-stage studio, 15+ screens, every page gating its AI button on prerequisites.
2. **The `simple.md` one** (notes + untracked `auto/` + `autoPilot.ts`): one LLM-driven flow, JSON filled in real time, one loading event per user step, "the user is not a real writer."

Building both at once is *why* there's 50 uncommitted files and a half-built `autoPilot`. Pick one. If the target user is "an average person who wants to make stories," design (1) is the wrong product and most of those 15 screens become dead weight. If you keep (1), delete the `auto/` experiment. Either way, write it down in one place and make the docs/screens match.

## 8. Cut list (what's not needed)

- `NUL`, `story_003_latest_bundle.zip`, both stray 0-byte `manga_registry.sqlite`, root `.venv/`, `.playwright-mcp/` dumps.
- `archive/` → move to a git tag/branch, then delete from the tree.
- `apps/api/docker-compose.yml` (duplicate); keep the integrated-root one + `infra/`.
- One of the two `docs/` trees; one of the two `requirements.txt`.
- `.agents/`, `.n8nac/`, `.github/agents/n8n-architect.agent.md` (unless n8n is genuinely part of this).
- The `` nesting layer.
- Either the `auto/`+`autoPilot` experiment **or** several of the legacy studio screens (per §7) — not both.

## 9. Missing list (what should be added)

- Real git history + branch protection + PR flow.
- CI (lint / build / smoke, and `pytest` once unit tests exist).
- Unit tests: backend services in isolation; a few frontend component tests.
- One canonical README + one architecture doc + one workflow/design doc; a "Project status — local single-user tool, not production-hardened" notice.
- Committed `openapi.json` and a generated/typed TS API client; delete the manual endpoint list.
- Committed `package-lock.json`; pinned Python deps.
- `LICENSE`, `CONTRIBUTING.md`, `CHANGELOG.md`.
- A documented secrets/`.env` story (the compose files and `.env.example` share `manga_maker_password`).
- If multi-user is a goal: real auth (per-key → user mapping), real rate limiting (Redis), pagination on list endpoints.
- Basic observability beyond the request-log line (error tracking, a `/metrics` endpoint).
- `.gitignore` entry for `.pytest_cache/`.

## 10. Recommended order of attack

1. **Commit everything** in logical chunks; from now on, no >10-file uncommitted backlog.
2. **Flatten the tree** and run the cut list in §8.
3. **Collapse the docs** to one README + one architecture + one workflow doc; reconcile `simple.md` ↔ `WORKFLOW.md` ↔ `AGENTS.md`; fix the port/`--reload` contradiction.
4. **Add CI** (lint + build + smoke).
5. **Decide the product** (§7) and prune the losing half.
6. **Decompose the god modules** — `llm_service`, `chapter_script_service`, `export.py`, `board/page.tsx` first.
7. **Type the frontend**; kill `any`; route all API calls through a typed client.
8. **Backfill tests** for the services that survive the refactor.
9. **Be honest about prod-readiness** — either finish auth/rate-limiting/multi-tenancy or label the project a local single-user tool and stop implying otherwise.

---

### Quick scorecard

| Aspect | State |
|---|---|
| Architecture / layering (backend) | Good |
| Code quality (backend, in the small) | OK — but modules far too large |
| Code quality (frontend) | Mixed — god components, heavy `any`, stray `console.log` |
| Git hygiene | Poor — single commit, ~50 uncommitted files, untracked features |
| Repo cleanliness | Poor — cruft, duplicate docs/compose/requirements, stray DBs, n8n leftovers |
| Documentation | Poor — contradictory, drifted counts, 3 conflicting workflow descriptions |
| Tests | Poor — smoke scripts only, no units, no frontend tests |
| CI / automation | Missing |
| Security / multi-tenancy | Stub — fine for local, mislabeled as prod-ready |
| Product clarity | Unresolved — two competing designs half-built |
