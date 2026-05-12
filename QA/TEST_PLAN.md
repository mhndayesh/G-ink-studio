# Test Plan — Manga Maker System v2.1

## Environment
- **Frontend**: http://localhost:3000 (Next.js 15.5.15)
- **Backend (port 8080)**: http://localhost:8080 (FastAPI + Uvicorn, reload mode)
- **Backend (port 8000)**: http://localhost:8000 (second instance, may conflict)
- **DB**: SQLite (storage/manga_registry.sqlite) + Neo4j :7687 + Qdrant :6333
- **Docker**: manga-neo4j (unhealthy but serving), manga-qdrant (unhealthy but serving)
- **Story**: story_003 ("others") — template_state, most phases completed

## Pages Under Test (15 screens)

| # | Phase | Route | Locked | Status |
|---|-------|-------|--------|--------|
| 1 | Home | `/studio/{id}/home` | No | ✓ No console errors |
| 2 | Seed | `/studio/{id}/seed` | No | ✓ No console errors |
| 3 | World | `/studio/{id}/world` | Yes (master_story=completed) | ✓ No console errors |
| 4 | Cast | `/studio/{id}/cast` | Yes (world_core=completed) | ✓ No console errors |
| 5 | Side | `/studio/{id}/side` | Yes (characters=completed) | ✓ No console errors |
| 6 | Web | `/studio/{id}/web` | Yes (relationship_map≠locked) | NOT TESTED |
| 7 | Board | `/studio/{id}/board` | Yes (characters=completed) | ✓ No console errors |
| 8 | Scenes | `/studio/{id}/scenes` | Yes (plot_outline=completed) | ✓ No console errors |
| 9 | Threads | `/studio/{id}/threads` | Yes (plot_outline=completed) | ✓ No console errors |
| 10 | Desk | `/studio/{id}/desk` | Yes (characters=completed) | ✓ No console errors |
| 11 | Court | `/studio/{id}/court` | Yes (plot_workspace=completed) | LOCKED (in_progress) |
| 12 | Script | `/studio/{id}/script` | Yes (plot_workspace=completed) | LOCKED (in_progress) |
| 13 | Timeline | `/studio/{id}/timeline` | No | ✓ No console errors |
| 14 | Radar | `/studio/{id}/radar` | No | ✓ No console errors |
| 15 | Control | `/studio/{id}/control` | No | NOT TESTED |

**Pages not yet browser-tested**: `web`, `control`, `court` (locked), `script` (locked)

## Test Categories

### 1. Smoke Tests (passed)
- [x] All 12 tested pages load without console errors on story_003
- [x] API health returns `{"ok":true,"status":"ok"}`
- [x] SQLite, Neo4j, Qdrant all connected
- [x] Mobile viewport (390x844) renders without errors on radar page

### 2. Functional Tests (to execute)
- [ ] Form submissions with valid data on each page
- [ ] Form submissions with invalid/empty data
- [ ] Empty state rendering (no data)
- [ ] Loading states during mutations
- [ ] AI generation flow (Generate → Apply → Save)
- [ ] Delete operations on chapters, scenes, characters
- [ ] Cross-reference cleanup on character deletion

### 3. Navigation Tests (to execute)
- [ ] Browser back/forward buttons across pages
- [ ] NextStep component navigation
- [ ] StudioShell sidebar navigation (all phases)
- [ ] Direct URL access to locked phase → redirect to home
- [ ] Refresh on mutation-in-progress

### 4. Edge Cases (to execute)
- [ ] Double-click on Create/Update/Delete buttons
- [ ] Rapid sequential mutations
- [ ] Empty arcSummary → AI Plot Assist (blocked by guard)
- [ ] Large text input (summary, descriptions)
- [ ] Special characters in text fields

### 5. API Tests (to execute)
- [ ] POST /plot-outline/chapters with duplicate chapter_id (update)
- [ ] POST /plot-outline/scenes with existing scene_id (update)
- [ ] DELETE /plot-outline/chapters/{id}
- [ ] DELETE /plot-outline/scenes/{id}
- [ ] DELETE /characters/profiles/{id} with cross-reference cleanup
- [ ] DELETE /characters/side-profiles/{id}
- [ ] All endpoints return proper error envelopes

### 6. Performance Tests (to execute)
- [ ] Lighthouse audit on home, seed, board pages
- [ ] Page load time (first contentful paint)
- [ ] API response times under load
- [ ] Memory usage during long sessions

### 7. Mobile Tests (to execute)
- [ ] All 15 pages at 390x844 viewport
- [ ] Touch interactions (Add Scene, Edit, Delete)
- [ ] Modal overflow/scrolling on small screens
- [ ] Sidebar accordion behavior

### 8. Security Tests (to execute)
- [ ] CORS headers for cross-origin requests
- [ ] Auth bypass with missing/wrong headers
- [ ] SQL injection via form fields
- [ ] XSS via character names / chapter titles
- [ ] Path traversal in file uploads (if any)
- [ ] Rate limiting (none exists)
