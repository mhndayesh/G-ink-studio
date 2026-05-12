# Bug Report — Manga Maker System v2.1

## BUG-001: Hardcoded Dead Link on Landing Page
- **Severity**: Medium
- **Page**: `/` (index)
- **File**: `apps/web/app/page.tsx:12`
- **Description**: The landing page has `<Link href="/studio/story_001/home">Open story_001</Link>`. Story `story_001` does not exist in the database. Clicking it leads to repeated API 404 errors (status, files/current, characters, etc.) with the StudioShell layout showing broken.
- **Repro**: Navigate to `/` → click "Open story_001" → see 10+ console errors
- **Console errors**: `Story story_001 not found` (×5 for status, ×2 for files/current)

## BUG-002: Repeated API Calls on 404
- **Severity**: Low
- **Page**: All studio pages
- **File**: Likely `store.ts` or `useQuery` config
- **Description**: When a story doesn't exist, the frontend makes 3 duplicate calls to `/status` and 2 duplicate calls to `/files/current` in rapid succession. This suggests no caching, no retry debounce, and possibly multiple components requesting the same data independently.
- **Repro**: Navigate to `/studio/story_001/home` → observe network tab

## BUG-003: Neo4j + Qdrant Docker Health "Unhealthy"
- **Severity**: Low
- **Description**: Both `manga-neo4j` and `manga-qdrant` Docker containers show status "unhealthy" in `docker ps` (12h uptime). However, both are actually serving requests correctly — Neo4j Bolt/HTTP endpoints respond, Qdrant responds to GET/PUT. The health check probes may be failing on TLS or authentication settings not configured for health checks.
- **Qdrant**: Repeated 409 "Collection already exists" for `story_lore_chunks` (harmless, collection creation is not idempotent in Python client)
- **Neo4j**: Logs are clean, started successfully

## BUG-004: Two Backend Instances Running (Port 8000 + 8080)
- **Severity**: Low
- **Description**: Two Python processes serve the API: PID 19592 on port 8000, PID 12196 on port 8080. The frontend `.env.local` points to port 8080. If one instance is restarted with new code and the other isn't, stale routes cause 404s (as seen with the original DELETE route 404). Only one instance should run, preferably with `--reload`.
- **Repro**: `netstat -ano | grep ":8000 \|:8080 "` shows two LISTENING entries

## BUG-005: Hardcoded DB Credentials in .env
- **Severity**: Medium (security)
- **File**: `apps/api/.env`
- **Description**: The `.env` file contains clear-text database credentials:
  - `MANGA_DATABASE_URL=postgresql+psycopg://manga:manga@localhost:5432/manga_maker`
  - `MANGA_OPENAI_API_KEY=lm-studio` (reveals provider choice)
  - `MANGA_NEO4J_PASSWORD=manga_maker_password`
- These are committed/accessible on disk. The `database_url` field in `config.py` is typed as `str` (not `SecretStr`), meaning accidental logging could leak it.

## BUG-006: ProfileTabs Rendering Before Data Load
- **Severity**: Medium
- **Page**: Cast, Side
- **Description**: When editing a character profile, `ProfileTabs` renders with `initialData={profileData}` where `profileData` starts as `{}`. This causes a flash of empty fields before the edit data populates. Fixed partially by `key={editProfileId}-{aiApplyCounter}` for forced remount, but the initial flash may still occur.

## BUG-007: No Empty-State Messages for Most Pages
- **Severity**: Low
- **Page**: Multiple (world, threads, timeline, radar, control)
- **Description**: When there's no data, several pages show either blank panels or `StructuredJsonView` with `{}` instead of a human-readable "No X created yet" message. The board page shows "No chapters created yet" but other pages don't follow this pattern.

## BUG-008: Delete Confirmation Doesn't Block Double-Click
- **Severity**: Low
- **Page**: All delete operations
- **Description**: The `confirm()` dialog is non-blocking for React renders. A user could potentially trigger delete twice by clicking the Delete button rapidly before the first mutation completes. The `useMutation` hook doesn't check `isPending` before the `confirm()` dialog.

## BUG-009: AI Field Schema Side-Page Uses Nested Paths that ProfileTabs May Not Parse
- **Severity**: Medium (potential silent failure)
- **Page**: Side
- **File**: `llm_service.py` (schema hint), `ProfileTabs.tsx` (rendering)
- **Description**: The side AI schema was changed to nested paths (e.g., `appearance_and_visual_design.appearance_details.age_range`). If `ProfileTabs` doesn't parse the AI response and flatten it into the nested template structure, the generated data will be stored but not displayed. This needs verification with actual AI generation on the side page.

## BUG-010: Stale STAGES Index Ranges in phases.ts
- **Severity**: Low
- **File**: `apps/web/lib/phases.ts:5-12`
- **Description**: The `STAGES` array has manual `startIdx`/`endIdx` that don't match actual phase indices:
  - Plot: says indices 6-8 (2 phases), but there are 3 phases (board @6, scenes @7, threads @8)
  - Write: says indices 8-10, but index 8 is threads (plot), not write
- These aren't currently used (code uses `filter` by stage), but they're misleading.

## BUG-011: Favicon 404
- **Severity**: Trivial
- **Description**: `GET /favicon.ico` returns 404 on all pages. No favicon file exists in the public directory.

## BUG-012: Google Fonts Fail (Offline)
- **Severity**: Low (visual)
- **Description**: Two `fonts.googleapis.com/css2?family=Inter` requests fail with `net::ERR_ABORTED`. The app uses `Inter` font which requires internet access. Offline users will see fallback system font.

## BUG-013: scene_id Already Exists Error (Fixed)
- **Severity**: Critical (FIXED)
- **Description**: `POST /plot-outline/scenes` with an existing `scene_id` returned 400 "scene_id already exists" when editing scenes. Fixed by allowing in-place updates in `create_scene()`.

## BUG-014: Character Delete Cleans Plot Outlines but Doesn't Notify User About ALL References
- **Severity**: Low
- **Description**: When deleting a character, the backend calls `_remove_character_references_from_plot` which removes the character name from chapters and scenes. However, it doesn't clean up:
  - Relationship map entries in `characters.json`
  - Thread references (`character_arc_threads`, `relationship_threads`, `power_threads`)
  - Scene `relationship_dynamic_used` (may reference the character)
  The frontend shows a warning with affected locations but only for chapters/scenes `characters_present`.
