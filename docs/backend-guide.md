# Backend API Reference + Services

## Quick Start

```powershell
cd apps\api
python -m venv .venv
pip install -r requirements.txt
copy .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8080
```

## Complete Endpoint Map (17 routers)

### health.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/health` | `health()` |

### auth.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/auth/me` | `me()` |

### stories.py
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/v1/stories` | `create_story()` |
| GET | `/api/v1/stories` | `list_stories()` |
| DELETE | `/api/v1/stories/{story_id}` | `delete_story()` |
| GET | `/api/v1/stories/{story_id}/status` | `story_status()` |
| GET | `/api/v1/stories/{story_id}/files/current` | `current_files()` |
| GET | `/api/v1/stories/{story_id}/versions/{version_id}/manifest` | `version_manifest()` |

### master_story.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/master-story` | `get_master_story()` |
| PATCH | `/api/v1/stories/{story_id}/master-story/template` | `patch_master_story_template()` |
| POST | `/api/v1/stories/{story_id}/master-story/validate` | `validate_master_story()` |

### characters.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/characters` | `get_characters()` |
| POST | `/api/v1/stories/{story_id}/characters/validate` | `validate_characters()` |
| PATCH | `/api/v1/stories/{story_id}/characters/structure` | `update_structure()` |
| POST | `/api/v1/stories/{story_id}/characters/profiles` | `create_profile()` |
| PATCH | `/api/v1/stories/{story_id}/characters/profiles/{profile_id}` | `update_profile()` |
| DELETE | `/api/v1/stories/{story_id}/characters/profiles/{profile_id}` | `delete_profile()` |
| POST | `/api/v1/stories/{story_id}/characters/side-profiles` | `create_side_profile()` |
| PATCH | `/api/v1/stories/{story_id}/characters/side-profiles/{profile_id}` | `update_side_profile()` |
| DELETE | `/api/v1/stories/{story_id}/characters/side-profiles/{profile_id}` | `delete_side_profile()` |
| GET | `/api/v1/stories/{story_id}/characters/check-conflicts` | `check_conflicts()` |
| POST | `/api/v1/stories/{story_id}/characters/relationship-map/activate` | `activate_relationship_map()` |
| POST | `/api/v1/stories/{story_id}/characters/auto-generate-side` | `auto_generate_side()` |
| POST | `/api/v1/stories/{story_id}/characters/sync-script-speakers` | `sync_script_speakers()` |

### plot_outline.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/plot-outline` | `get_plot_outline()` |
| POST | `/api/v1/stories/{story_id}/plot-outline/validate` | `validate_plot_outline()` |
| PATCH | `/api/v1/stories/{story_id}/plot-outline/story-start-workflow` | `update_story_start_workflow()` |
| PATCH | `/api/v1/stories/{story_id}/plot-outline/narrative-structure` | `update_narrative_structure()` |
| PATCH | `/api/v1/stories/{story_id}/plot-outline/arc-overview` | `patch_arc_overview()` |
| POST | `/api/v1/stories/{story_id}/plot-outline/chapters` | `create_chapter()` |
| POST | `/api/v1/stories/{story_id}/plot-outline/scenes` | `create_scene()` |

### plot_workspace.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/plot-workspace` | `get_workspace()` |
| POST | `/api/v1/stories/{story_id}/plot-workspace/validate` | `validate_workspace()` |
| PATCH | `/api/v1/stories/{story_id}/plot-workspace/free-writing` | `save_free_writing()` |
| POST | `/api/v1/stories/{story_id}/plot-workspace/ai-complete` | `ai_complete()` |
| POST | `/api/v1/stories/{story_id}/plot-workspace/ai-complete/decision` | `decide_ai_completion()` |
| POST | `/api/v1/stories/{story_id}/plot-workspace/analyze` | `analyze()` |
| GET | `/api/v1/stories/{story_id}/plot-workspace/questions` | `get_questions()` |
| POST | `/api/v1/stories/{story_id}/plot-workspace/questions/{question_id}/answer` | `answer_question()` |
| GET | `/api/v1/stories/{story_id}/plot-workspace/confirmation` | `get_confirmation()` |
| POST | `/api/v1/stories/{story_id}/plot-workspace/approve` | `approve()` |

### events.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/events` | `get_events()` |
| GET | `/api/v1/stories/{story_id}/patches` | `get_patches()` |
| POST | `/api/v1/stories/{story_id}/events/from-approved-workspace` | `create_from_approved_workspace()` |

### versions.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/versions` | `list_versions()` |
| GET | `/api/v1/stories/{story_id}/versions/{version_id}` | `get_version()` |
| POST | `/api/v1/stories/{story_id}/versions/create-from-approved-events` | `create_from_approved_events()` |
| POST | `/api/v1/stories/{story_id}/versions/{version_id}/mark-official` | `mark_official()` |

### chapter_script.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/chapter-script` | `get_script()` |
| GET | `/api/v1/stories/{story_id}/chapter-script/chapters-status` | `chapters_status()` |
| POST | `/api/v1/stories/{story_id}/chapter-script/load` | `load_script()` |
| POST | `/api/v1/stories/{story_id}/chapter-script/validate` | `validate_script()` |
| POST | `/api/v1/stories/{story_id}/chapter-script/generate` | `generate_script()` |
| PATCH | `/api/v1/stories/{story_id}/chapter-script` | `patch_script()` |
| POST | `/api/v1/stories/{story_id}/chapter-script/extract-events` | `extract_events()` |
| POST | `/api/v1/stories/{story_id}/chapter-script/generate-batch` | `generate_batch()` |
| POST | `/api/v1/stories/{story_id}/chapter-script/fill-visuals-batch-all` | `fill_visuals_batch_all()` |
| POST | `/api/v1/stories/{story_id}/chapter-script/approve` | `approve_script()` |

### locations.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/locations` | `list_locations()` |
| POST | `/api/v1/stories/{story_id}/locations` | `create_location()` |
| GET | `/api/v1/stories/{story_id}/locations/{location_id}` | `get_location()` |
| PATCH | `/api/v1/stories/{story_id}/locations/{location_id}` | `update_location()` |
| DELETE | `/api/v1/stories/{story_id}/locations/{location_id}` | `delete_location()` |
| POST | `/api/v1/stories/{story_id}/locations/{location_id}/ai-fill` | `ai_fill_location()` |
| POST | `/api/v1/stories/{story_id}/locations/ai-generate-all` | `ai_generate_all_locations()` |

### export.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/stories/{story_id}/export/story` | `export_story()` |
| GET | `/api/v1/stories/{story_id}/export/scenes` | `export_scenes()` |
| GET | `/api/v1/stories/{story_id}/export/visuals` | `export_visuals()` |
| GET | `/api/v1/stories/{story_id}/export/visuals-bundle` | `export_visuals_bundle()` |
| GET | `/api/v1/stories/{story_id}/export/validate` | `export_validate()` |
| GET | `/api/v1/stories/{story_id}/export/triple-zip` | `export_triple_zip()` |
| GET | `/api/v1/stories/{story_id}/export/raw-zip` | `export_raw_zip()` |

### continuity.py
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/v1/stories/{story_id}/continuity/check-current` | `check_current()` |
| POST | `/api/v1/stories/{story_id}/continuity/check-version` | `check_version()` |
| GET | `/api/v1/stories/{story_id}/continuity/reports` | `reports()` |

### graph.py
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/v1/stories/{story_id}/graph/project-events` | `project_events()` |
| GET | `/api/v1/stories/{story_id}/graph/projections` | `projections()` |
| GET | `/api/v1/stories/{story_id}/graph/web` | `web_graph()` |
| GET | `/api/v1/stories/{story_id}/graph/status` | `status()` |

### vector.py
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/v1/stories/{story_id}/vector/upsert-current-memory` | `upsert_current()` |
| GET | `/api/v1/stories/{story_id}/vector/chunks` | `chunks()` |
| GET | `/api/v1/stories/{story_id}/vector/status` | `status()` |

### llm.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/llm/status` | `llm_status()` |
| GET | `/api/v1/llm/runs` | `list_llm_runs()` |

### db.py
| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/v1/db/migration-info` | `migration_info()` |

### ai.py
| Method | Path | Handler |
|--------|------|---------|
| POST | `/api/v1/stories/{story_id}/ai/generate` | `ai_generate()` |
| GET | `/api/v1/stories/{story_id}/ai/references` | `get_references()` |

---

## Services Dependency Graph

```
get_registry() → SQLiteRegistry
get_validation_service() → ValidationService
get_snapshot_service() → SnapshotService (needs registry + validator)
  ├── get_story_service() → StoryService
  ├── get_master_story_service() → MasterStoryService
  ├── get_character_service() → CharacterService
  ├── get_plot_outline_service() → PlotOutlineService
  ├── get_plot_workspace_service() → PlotWorkspaceService (+ llm)
  ├── get_event_patch_service() → EventPatchService
  ├── get_version_service() → VersionService (+ graph + vector + continuity)
  ├── get_chapter_script_service() → ChapterScriptService
  └── get_continuity_service() → ContinuityService
get_graph_service() → GraphService (needs registry + settings)
get_vector_service() → VectorService (needs registry + settings)
get_llm_service() → LLMService (needs settings + registry)
```

---

## Config (Settings)

All env vars prefixed with `MANGA_`:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `MANGA_STORAGE_ROOT` | Path | `storage/stories` | Snapshot storage root |
| `MANGA_REGISTRY_SQLITE_PATH` | Path | `storage/manga_registry.sqlite` | Dev SQLite registry |
| `MANGA_TEMPLATE_DIR` | Path | `app/templates` | Template JSON directory |
| `MANGA_REGISTRY_BACKEND` | str | `sqlite` | `sqlite` or `postgres` |
| `MANGA_DATABASE_URL` | str | postgresql+psycopg://... | Production DB |
| `MANGA_LLM_ENABLED` | bool | `false` | Enable LLM |
| `MANGA_OPENAI_API_KEY` | SecretStr | `None` | API key |
| `MANGA_OPENAI_MODEL` | str | `gpt-4.1-mini` | Model name |
| `MANGA_OPENAI_BASE_URL` | str | `https://api.openai.com/v1` | Base URL |
| `MANGA_AUTH_ENABLED` | bool | `false` | Enable auth |
| `MANGA_DEV_USER_ID` | str | `dev_user` | Dev user |
| `MANGA_NEO4J_ENABLED` | bool | `false` | Enable Neo4j |
| `MANGA_NEO4J_URI` | str | `bolt://localhost:7687` | Neo4j URI |
| `MANGA_QDRANT_ENABLED` | bool | `false` | Enable Qdrant |
| `MANGA_QDRANT_URL` | str | `http://localhost:6333` | Qdrant URL |
| `MANGA_CORS_ORIGINS` | str | `http://localhost:3000` | CORS origins |

---

## Key Request Models

| Model | Used By |
|-------|---------|
| `CreateStoryRequest` | POST /stories |
| `MasterStoryTemplatePatchRequest` | PATCH /master-story/template |
| `CharacterProfileCreateRequest` | POST /characters/profiles |
| `SideCharacterProfileCreateRequest` | POST /characters/side-profiles |
| `CharacterStructureRequest` | PATCH /characters/structure |
| `PlotArcOverviewPatchRequest` | PATCH /plot-outline/arc-overview |
| `PlotChapterCreateRequest` | POST /plot-outline/chapters |
| `PlotNarrativeStructureRequest` | PATCH /plot-outline/narrative-structure |
| `PlotSceneCreateRequest` | POST /plot-outline/scenes |
| `PlotStartWorkflowRequest` | PATCH /plot-outline/story-start-workflow |
| `PlotWorkspaceFreeWritingRequest` | PATCH /plot-workspace/free-writing |
| `PlotWorkspaceAICompleteRequest` | POST /plot-workspace/ai-complete |
| `PlotWorkspaceAICompletionDecisionRequest` | POST /plot-workspace/ai-complete/decision |
| `PlotWorkspaceQuestionAnswerRequest` | POST /questions/{id}/answer |
| `PlotWorkspaceApproveRequest` | POST /plot-workspace/approve |
| `ChapterScriptPatchRequest` | PATCH /chapter-script |
| `ContinuityCheckRequest` | POST /continuity/check-version |
| `AiGenerateRequest` | POST /ai/generate |

---

## Template Files (6)

Located in `app/templates/`:

| Template | Lines | Purpose |
|----------|-------|---------|
| `master_story.json` | 246 | Genre, factions, threats, story foundation |
| `characters.json` | 791 | Major/side profiles, relationship map, 7-tab template |
| `plot_outline.json` | 325 | Arcs, narrative structures, chapters, scenes, threads |
| `memory_system.json` | 390 | **Frozen** — never edit; versioned per bundle |
| `plot_workspace.json` | 348 | Free writing, AI completion, analysis, questions |
| `chapter_script.json` | 230 | Pages, panels, dialogue, script format |

---

## Smoke Test

```bash
cd apps/api
python tests/smoke_test.py
```

Expected: `"passed": true`.
