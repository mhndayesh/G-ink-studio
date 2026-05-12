# PostgreSQL Schema (Production Target)

## Overview

18 tables for the story-state engine. Local dev uses SQLite fallback; production targets PostgreSQL via Alembic migrations.

## Tables

### stories
| Column | Type | Notes |
|--------|------|-------|
| `story_id` | VARCHAR(64) PK | e.g. `story_001` |
| `title` | VARCHAR(200) | |
| `user_id` | VARCHAR(64) | Owner (from auth) |
| `current_version_id` | VARCHAR(64) | |
| `state_type` | VARCHAR(32) | `template_state` |
| `phase_status` | JSONB | Per-phase completion map |
| `continuity_status` | VARCHAR(64) | |
| `official_plot_outline_filename` | VARCHAR(100) | **Must be `plot_outline.json`** |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### users
| Column | Type | Notes |
|--------|------|-------|
| `user_id` | VARCHAR(64) PK | |
| `email` | VARCHAR(255) | |
| `display_name` | VARCHAR(200) | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### story_versions
| Column | Type | Notes |
|--------|------|-------|
| `version_id` | VARCHAR(64) PK | e.g. `v001`, `v002` |
| `story_id` | VARCHAR(64) FK → stories | |
| `version_number` | INTEGER | Sequential |
| `previous_version_id` | VARCHAR(64) | Null for v001 |
| `status` | VARCHAR(32) | `official` or `candidate` |
| `state_type` | VARCHAR(32) | |
| `snapshot_folder_path` | TEXT | |
| `created_from_event_ids` | JSONB | |
| `created_at` | TIMESTAMPTZ | |

### story_files
| Column | Type | Notes |
|--------|------|-------|
| `file_id` | VARCHAR(64) PK | |
| `story_id` | VARCHAR(64) FK | |
| `version_id` | VARCHAR(64) FK | |
| `file_type` | VARCHAR(64) | `master_story`, `characters`, etc. |
| `official_filename` | VARCHAR(100) | Validated against whitelist |
| `storage_path` | TEXT | |
| `state_type` | VARCHAR(32) | |
| `checksum` | VARCHAR(64) | |
| `json_copy` | JSONB | Full JSON snapshot |
| `created_at` | TIMESTAMPTZ | |

### story_events
| Column | Type | Notes |
|--------|------|-------|
| `event_id` | VARCHAR(64) PK | |
| `story_id` | VARCHAR(64) FK | |
| `workspace_id` | VARCHAR(64) | |
| `version_from` | VARCHAR(64) | |
| `version_to` | VARCHAR(64) | Nullable (set when applied) |
| `event_type` | VARCHAR(64) | |
| `event_category` | VARCHAR(64) | |
| `target_file` | VARCHAR(64) | |
| `target_entity_id` | VARCHAR(64) | |
| `summary` | TEXT | |
| `payload` | JSONB | |
| `approval_status` | VARCHAR(32) | `approved` |
| `created_at` | TIMESTAMPTZ | |

### json_patches
| Column | Type | Notes |
|--------|------|-------|
| `patch_id` | VARCHAR(64) PK | |
| `story_id` | VARCHAR(64) FK | |
| `workspace_id` | VARCHAR(64) | |
| `event_id` | VARCHAR(64) | |
| `target_file` | VARCHAR(64) | |
| `target_branch` | TEXT | JSON pointer path |
| `op` | VARCHAR(32) | `replace`, `add`, `remove` |
| `value` | JSONB | |
| `approval_status` | VARCHAR(32) | |
| `applied_version_id` | VARCHAR(64) | Nullable |
| `created_at` | TIMESTAMPTZ | |

### plot_workspaces
| Column | Type | Notes |
|--------|------|-------|
| `workspace_id` | VARCHAR(64) PK | |
| `story_id` | VARCHAR(64) FK | |
| `user_free_writing` | JSONB | |
| `ai_completion` | JSONB | |
| `analysis_results` | JSONB | |
| `consequence_questions` | JSONB | |
| `final_confirmation` | JSONB | |
| `workspace_status` | JSONB | |
| `linked_files` | JSONB | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### chapter_scripts
| Column | Type | Notes |
|--------|------|-------|
| `script_id` | VARCHAR(64) PK | |
| `story_id` | VARCHAR(64) FK | |
| `script_format` | JSONB | |
| `linked_files` | JSONB | |
| `pages` | JSONB | |
| `script_status` | JSONB | |
| `approved_by_user` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### continuity_reports
| Column | Type | Notes |
|--------|------|-------|
| `report_id` | VARCHAR(64) PK | |
| `story_id` | VARCHAR(64) FK | |
| `version_id` | VARCHAR(64) | |
| `summary` | TEXT | |
| `checks` | JSONB | |
| `passed` | BOOLEAN | |
| `created_at` | TIMESTAMPTZ | |

### graph_projections / vector_chunks / llm_runs / sync_jobs

Supporting tables for Neo4j, Qdrant, and LLM metadata with `JSONB` payload columns and `TIMESTAMPTZ` timestamps.

---

## Key Constraints

- `story_files.official_filename` must be one of the 6 official names (`master_story.json`, `characters.json`, `plot_outline.json`, `memory_system.json`, `plot_workspace.json`, `chapter_script.json`)
- `story_events` is append-only via database trigger
- `stories.official_plot_outline_filename` must be `plot_outline.json`

## Migration

```bash
alembic upgrade head
```

Initial migration: `migrations/versions/0001_initial_story_state_engine.py`
