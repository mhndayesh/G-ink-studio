# Changelog

Notable changes. Newest first.

## Unreleased — `cleanup/repo-hygiene` branch

Repo-hygiene pass acting on [`docs/REPO-CRITIQUE.md`](docs/REPO-CRITIQUE.md) and
[`docs/BUNDLE-AUDIT.md`](docs/BUNDLE-AUDIT.md).

- **Visual-prompt policy (new `apps/api/app/services/visual_prompt.py`).** Every
  AI image prompt the export emits is now short, visual-only and colour-free, and
  prefixed with the one fixed tag **`black and white Japanese manga style`**.
  `sanitize_visual_prompt()` strips colour words, lighting/atmosphere/composition
  talk, "cinematic"/"noir"/"masterpiece"/render-quality noise and per-entity style
  words; `compile_visual_prompt()` joins + prefixes; `negative_prompt()` gives the
  standard B&W-manga exclusion list. `llm_service.py` prompt schemas now ask the
  model for that shape directly (`STYLE_INSTRUCTION`).
- **BUNDLE-AUDIT export fixes** (`export_service.py`): scrambled page
  `Location:` headers repaired against the panel content, with a `location_mismatch`
  validator warning (#1); camera-shot slot drops "Action Shot"/"Reaction Shot"/"Custom"
  (#2); `Render mode` derived from in-frame named-cast count, with a "pick 2 references"
  note for 3+ (#3); character & location AI prompts rebuilt clean (#4/#6); object-only
  panels drop the "Expression: N/A …" line (#8); `export/validate` flags source prompts
  that still carry colour/lighting/style noise.
- **Refactors** (all behavior-preserving; backend ones smoke-test + unit-test verified):
  - `apps/api/app/api/v1/export.py` (~1690-line router) → router (~265 lines) +
    `apps/api/app/services/export_service.py` (the ~45 rendering helpers).
  - Shared "is this chapter/scene/page non-empty?" predicates (duplicated in
    `StoryService` and `ChapterScriptService`) → `apps/api/app/services/content_inspector.py`.
  - `llm_service.py` (1894→1529): stable-relationship-ID helpers + `backfill_thread_ids`
    → `apps/api/app/services/thread_ids.py`; the static field-schema hint
    → `apps/api/app/services/llm_prompts.py`; the context trimmer (`_clip_text`,
    `_compact_generation_context`) → `apps/api/app/services/llm_context.py`.
  - `chapter_script_service.py` (1783→1623): the patch-by-path engine →
    `apps/api/app/services/script_patch.py`. (`master_story_service.py` and
    `plot_outline_service.py` have their own *non-identical* `_apply_patch` copies —
    converging those is a follow-up.)
  - `export_service.py` (1592→880): split into a facade + `apps/api/app/services/export_shared.py`
    (low-level coercers / title helpers / lines→text·md·docx / file loaders),
    `export_validation.py` (`_validate_export` / `_format_validation_lines`), and
    `export_character_files.py` (per-character sheet lines / prompt files / panels.csv /
    `_profile_role` / `_profile_bio`); `export_service.py` re-exports everything the router
    needs, so `apps/api/app/api/v1/export.py` is unchanged.
  - `apps/web/app/studio/[storyId]/board/page.tsx` (1295→990): React-free constants
    + helpers → `./boardModel.ts` (+ `boardModel.test.ts`); the three modal/dialog
    blocks → `./BoardModals.tsx` (`ChapterModal`, `RedoArcModal`, `DeleteChapterDialog`);
    the narrative-structure beat editors → `./StructureEditors.tsx`; the chapter/arc
    forms are now typed (`ChapterForm` / `ArcForm`). (`content`/`refData`/AI-callback
    `any`s and a state-into-hooks split still TODO.)
- **Tests:** added a `pytest` suite (`apps/api/tests/`) — `pyproject.toml` config,
  unit tests for `visual_prompt`, `content_inspector`, `script_patch`, `thread_ids`,
  `llm_context`, `export_service`, `export_shared`, plus `tests/test_smoke.py` running
  the e2e workflow under pytest. **49 passed.** CI backend job runs `python -m pytest`.
- **Frontend now lints clean and builds.** Fixed the one `eslint` *error*
  (`react/no-unescaped-entities` in `side/page.tsx`), all the pre-existing
  unused-var/exhaustive-deps warnings, and a pre-existing `next build` failure in
  `board/page.tsx` (`enrichArc()` had a duplicate `arc_length_type` object key —
  TS2783). `npm run lint` → no problems; `npm run build` → ok; `npm run smoke` →
  `"passed": true`.
- **Frontend test runner.** Added `vitest` (devDependency) + `npm test` =
  `vitest run` + `vitest.config.ts` + `board/boardModel.test.ts` (8 tests). CI
  frontend job runs `npm test`.
- **BUNDLE-AUDIT #7** (partial): the visuals bundle lowercases dialogue speaker
  labels so they match the (lowercased) character reference sheets / the
  importer's lowercase id lookup. Typo-level spelling drift is still a source fix.

Other changes in this branch are below; none change backend/frontend behavior
unless noted.

- **Layout flattened.** `apps/api`, `apps/web`, `docs`, `QA`, `infra`, `scripts`,
  `docker-compose.yml`, `CLAUDE.md`, `WORKFLOW.md` lifted out of
  `integrated/manga_maker_integrated_v1_2/` to the repo root; the nesting layer
  removed.
- **Cruft removed:** `archive/` (old design docs/reports — still in git history),
  `.agents/` + `.n8nac/` + `.github/agents/n8n-architect.agent.md` (unrelated n8n
  automation), a stray 0-byte `manga_registry.sqlite`, the duplicate
  `apps/api/docker-compose.yml`, the contradictory bundle `README.md`, the
  duplicate root `requirements.txt` (identical to `apps/api/requirements.txt`),
  and the superseded root `docs/` copy.
- **Docs reconciled:** fixed all `integrated/manga_maker_integrated_v1_2/` path
  references; fixed the `uvicorn --reload --host 0.0.0.0 --port 8000` commands
  (the project standard is `uvicorn app.main:app --port 8080`, no `--reload`);
  dropped drifted endpoint/screen/version counts from the sub-`README`s; added a
  "Project status — local single-user tool, not production-hardened" section;
  promoted the `simple.md` scratch notes to `docs/SIMPLE-FLOW-PROPOSAL.md`.
- **`.gitignore`:** stop ignoring `package-lock.json` (now committed for
  reproducible installs); ignore `.pytest_cache/`, `.agents/`, `.n8nac/`; fixed
  the `/NUL` pattern.
- **Added:** `apps/web/package-lock.json`, `CHANGELOG.md`, `CONTRIBUTING.md`,
  `.github/workflows/ci.yml` (lint + build + smoke).

## Pre-history

See `git log` before this branch. Earlier work history was squashed into the
single "Initial project import" commit; from now on changes land as discrete
commits.
