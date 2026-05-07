# Reproduction Steps — Manga Maker System v2.1

## REPRO-001: Dead Link story_001
1. Open browser to `http://localhost:3000`
2. Click "Open story_001" link
3. Observe: Page loads with StudioShell sidebar but all data panels show empty/error
4. Open DevTools Console → see 10 errors: `Story story_001 not found` (×5 status calls, ×2 files/current calls)
5. No user-facing error message on the page itself — just empty panels

## REPRO-002: Delete Scene Returns 404 (If Backend Not Restarted)
1. Navigate to `http://localhost:3000/studio/story_003/scenes`
2. Click a scene to open edit modal
3. Click "Delete Scene" button in modal
4. Confirm dialog → observe 404 in console: `DELETE /api/v1/stories/story_003/plot-outline/scenes/scene_001 → 404 "API error 404"`
5. Root cause: Backend on port 8080 needs restart after DELETE route was added

## REPRO-003: AI Plot Assist Fails Without Arc Summary
1. Navigate to `http://localhost:3000/studio/story_003/board`
2. Scroll to "AI Plot Assist" button
3. Click it without writing anything in "Arc summary"
4. Observe: Alert "Write an arc summary first before using AI Plot Assist." (GUARD WORKS)

## REPRO-004: AI Scene Generation Without Chapter Selection
1. Navigate to `http://localhost:3000/studio/story_003/scenes`
2. In AI Fill Panel, select "Generate Scenes"
3. Click Generate without selecting any chapters
4. Observe: AI generates scenes for ALL chapters (no chapter selector was checked)
5. Select specific chapters via checkboxes → AI should target only those

## REPRO-005: Character Delete Cross-Reference Warning
1. Navigate to `http://localhost:3000/studio/story_003/cast`
2. Find a character that appears in chapters/scenes
3. Click "Delete" on that character card
4. Confirm dialog
5. Observe: Alert showing cross-reference warnings (which chapters/scenes had the character)
6. Navigate to Board and Scenes → verify character was removed from characters_present

## REPRO-006: Locked Phase Redirect
1. Navigate to `http://localhost:3000/studio/story_003/court` (locked: plot_workspace is "in_progress")
2. Observe: Should redirect to `/studio/story_003/home`
3. The sidebar should show "Court" as greyed out with lock indicator

## REPRO-007: Mobile Viewport Layout
1. Open DevTools → Toggle Device Toolbar → iPhone 14 (390×844)
2. Observe: Sidebar transforms to accordion dropdown
3. Check that all text is readable and buttons are tappable
4. Check modal dialogs don't overflow horizontally

## REPRO-008: Google Fonts Missing Offline
1. Disconnect internet
2. Navigate to `http://localhost:3000`
3. Observe: Text renders in fallback system font instead of Inter
4. DevTools shows `ERR_ABORTED` for fonts.googleapis.com requests

## REPRO-009: Two Backend Instance Conflict
1. Run `netstat -ano | findstr ":8000 :8080"`
2. Observe: Two LISTENING entries on different PIDs
3. If one instance has old code, API routes may 404
4. Kill all Python processes and restart with single `uvicorn --port 8080`
