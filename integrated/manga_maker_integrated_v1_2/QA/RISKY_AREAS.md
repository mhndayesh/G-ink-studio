# Risky Areas — Manga Maker System v2.1

## Risk Heat Map

| Area | Bug Risk | Data Risk | Security Risk | Overall |
|------|---------|-----------|---------------|---------|
| Character Service (delete/update) | HIGH | HIGH | MEDIUM | **HIGH** |
| LLM Service (AI generation) | HIGH | HIGH | HIGH | **HIGH** |
| Plot Outline Service (create/delete) | MEDIUM | MEDIUM | LOW | **MEDIUM** |
| Phase Gating / Locking | MEDIUM | LOW | LOW | **MEDIUM** |
| ProfileTabs Component | MEDIUM | MEDIUM | LOW | **MEDIUM** |
| Writing Desk / Workspace | MEDIUM | LOW | LOW | **MEDIUM** |
| Thread Save System | HIGH | MEDIUM | LOW | **HIGH** |
| Auth System | LOW | LOW | CRITICAL | **HIGH** |

---

## 1. Character Deletion + Cross-Reference Cleanup
**Risk**: HIGH
**Files**: `character_service.py`, `cast/page.tsx`, `side/page.tsx`

### Why Risky
- `_remove_character_references_from_plot` only cleans `characters_present` in chapters/scenes
- Does NOT clean: relationship_map entries, thread references, `relationship_dynamic_used` field
- The `_save()` call in `delete_profile` only saves characters.json, while plot_outline changes are saved separately via `SnapshotService.write_existing_json` + `registry.update_file_json_copy`
- If plot_outline save fails after character delete succeeds, data is inconsistent
- **Race condition**: If two deletes happen concurrently, the second delete could try to save stale plot_outline data

### Mitigation
- Use database transactions or version-based optimistic locking
- Clean ALL reference types, not just `characters_present`
- Add orphan detection endpoint to find stale references

---

## 2. AI Generation Flow
**Risk**: HIGH
**Files**: `llm_service.py`, `ai.py`, all page TSX files

### Why Risky
- Full story context (5 JSON files) sent to external LLM on every call — no consent, no data minimization
- `_build_field_schema` was recently rewritten for side characters (nested paths). If ProfileTabs doesn't parse nested paths, AI-generated side data is stored but invisible
- Frontend enrichment functions (`enrichChapter`, `enrichScene`) add defaults but don't validate AI output structure
- `handleApplyAi` on scenes page now does bulk create for multiple scenes — no transaction, if one fails, partial set is created
- LLM fallback returns `{"generated_fields": {}}` — frontend may not show any indication that LLM wasn't used

### Mitigation
- Add user consent before sending data to LLM
- Validate AI output structure before applying
- Wrap bulk creates in a transaction or add rollback
- Show clear "LLM not configured — using fallback" banner

---

## 3. Thread Save System
**Risk**: HIGH
**Files**: `threads/page.tsx`, `plot_outline_service.py`

### Why Risky
- Thread items saved via individual `patchArcOverview` calls (one per field)
- No batch/transactional save — partial failure means inconsistent state
- `removeItem()` uses `operation: "remove_index"` which relies on index stability — if items shift during concurrent edits, wrong items get deleted
- Local state (`setCharThreads`, `setRelThreads`, etc.) isn't synced with backend after save failures

### Mitigation
- Replace individual patches with single "save all threads" endpoint
- Use version checks to detect concurrent modifications
- Sync local state from backend after save

---

## 4. Phase Gating Edge Cases
**Risk**: MEDIUM
**Files**: `phases.ts`, `StudioShell.tsx`, `store.ts`

### Why Risky
- `NextStep` component navigates purely by array position — doesn't check if next phase is locked
- If a phase's required dependency regresses (e.g., plot_outline reverts to "in_progress"), the UI still shows it as unlocked until page refresh
- `relationship_map` gating uses `actual !== "locked"` which is overly permissive — `undefined` status passes
- Three review phases (timeline, radar, control) are always unlocked even with empty story

### Mitigation
- `NextStep` should call `isPhaseUnlocked()` before navigating
- Phase statuses should be revalidated on every navigation
- Tighten `relationship_map` gate to check for explicit "completed" or "available"

---

## 5. ProfileTabs Edit Flow
**Risk**: MEDIUM
**Files**: `ProfileTabs.tsx`, `cast/page.tsx`, `side/page.tsx`

### Why Risky
- `initialData` prop used to pre-fill form but `onDataChange` callback sends partial updates
- Counter-based `key` remount (`key={editProfileId}-{aiApplyCounter}`) causes full component re-creation, losing unsaved in-progress edits
- No form dirty/unsaved-changes tracking — navigating away silently loses edits

### Mitigation
- Track dirty state and warn before navigation
- Use controlled form pattern instead of remount
- Separate "initial load" from "subsequent edits"

---

## 6. Multiple Backend Instances
**Risk**: MEDIUM
**Files**: N/A (ops)

### Why Risky
- Two Python processes serving API (port 8000 and 8080)
- Frontend configured for port 8080
- If port 8000 instance has different code version, stale routes cause 404s
- Neo4j and Qdrant containers marked "unhealthy" in Docker (actual service is fine, health probe failures)

### Mitigation
- Run single uvicorn instance with `--reload`
- Fix Docker health check probes
- Add startup health check to verify all routes are registered

---

## 7. Form Submit Double-Click Vulnerability
**Risk**: MEDIUM
**Files**: All page TSX files with mutations

### Why Risky
- `useMutation` guards `isPending` but only inside event handlers, not on button `disabled` prop
- `confirm()` dialog is synchronous but React state updates are batched — `isPending` may not update before second click
- Delete buttons don't check `deleteChapterMut.isPending` before opening confirm dialog

### Mitigation
- Add `disabled={mutation.isPending}` to ALL submit/delete buttons
- Use `mutation.mutateAsync` with `.finally()` cleanup for sequential operations

---

## 8. Hardcoded Config Values
**Risk**: LOW
**Files**: `.env`, `config.py`

### Why Risky
- DB credentials, Neo4j password, and API key stored in plain text
- `database_url` is `str` not `SecretStr`
- Default values in config are real credentials, not placeholders

### Mitigation
- Move all secrets to `SecretStr`
- Default config values should be empty strings, not real credentials
- Add `.env` to `.gitignore` (already there, but verify)
