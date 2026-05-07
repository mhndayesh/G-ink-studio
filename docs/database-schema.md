# Database Schema

## Overview

PostgreSQL stores identity, ownership, versioning, approvals, events, patches, sync jobs, continuity reports, workspace status, script status, and file paths. Full JSON snapshots live in file storage (local filesystem or S3-compatible object storage), with optional JSONB copies in SQL for indexing and debugging.

## Enums

```sql
CREATE TYPE story_state_type AS ENUM ('template_state', 'story_state');
CREATE TYPE version_status AS ENUM ('draft', 'candidate', 'official', 'archived', 'failed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'needs_revision');
CREATE TYPE sync_status AS ENUM ('pending', 'running', 'success', 'failed', 'skipped');

CREATE TYPE file_type AS ENUM (
  'master_story', 'characters', 'plot_outline',
  'memory_system', 'plot_workspace', 'chapter_script', 'version_manifest'
);

CREATE TYPE workspace_status AS ENUM (
  'not_started', 'free_writing', 'ai_completion_ready', 'ai_completion_done',
  'analysis_ready', 'questions_pending', 'confirmation_ready',
  'approved', 'rejected', 'archived'
);

CREATE TYPE event_category AS ENUM (
  'character_events', 'relationship_events', 'power_events',
  'world_events', 'faction_events', 'threat_events',
  'plot_events', 'system_events'
);

CREATE TYPE patch_operation AS ENUM ('add', 'replace', 'remove', 'append_to_array', 'merge_object');
```

## Core Tables

### `stories`

One row per manga/story project. Tracks current official version and state type.

| Column | Type | Description |
|--------|------|-------------|
| `story_id` | TEXT PK | Unique story identifier (e.g., `story_001`) |
| `user_id` | TEXT FK → users | Story owner |
| `title` | TEXT NOT NULL | Story title |
| `current_version_id` | TEXT FK → story_versions | Current official version |
| `state_type` | story_state_type | template_state or story_state |
| `official_plot_outline_filename` | TEXT | Always 'plot_outline.json' (enforced by CHECK constraint) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

### `arcs`

Story arcs within a project.

| Column | Type | Description |
|--------|------|-------------|
| `arc_id` | TEXT PK | Unique arc identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `arc_number` | INTEGER | Ordinal position (1, 2, 3...) |
| `arc_title` | TEXT | Arc title |
| `status` | TEXT | planned / active / completed |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

### `chapters`

Chapters within a story.

| Column | Type | Description |
|--------|------|-------------|
| `chapter_id` | TEXT PK | Unique chapter identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `arc_id` | TEXT FK → arcs | Parent arc (nullable) |
| `chapter_number` | INTEGER | Ordinal position |
| `chapter_title` | TEXT | Chapter title |
| `status` | TEXT | planned / writing / approved |

### `story_versions`

Version bundles. Each version is a synchronized snapshot of all official JSON files.

| Column | Type | Description |
|--------|------|-------------|
| `version_id` | TEXT PK | Version identifier (e.g., `v001`) |
| `story_id` | TEXT FK → stories | Parent story |
| `version_number` | INTEGER | Ordinal version number |
| `previous_version_id` | TEXT FK → story_versions | Chain to previous version |
| `arc_id` | TEXT FK → arcs | Associated arc (nullable) |
| `chapter_id` | TEXT FK → chapters | Associated chapter (nullable) |
| `status` | version_status | draft / candidate / official / archived / failed |
| `state_type` | story_state_type | template_state or story_state |
| `snapshot_folder_path` | TEXT | File storage path for this version's JSON bundle |
| `created_from_event_ids` | JSONB | Event IDs that led to this version |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `marked_official_at` | TIMESTAMPTZ | When marked official (nullable) |

**Constraints:** UNIQUE(story_id, version_number), version_number > 0

### `story_files`

File metadata and paths for each version.

| Column | Type | Description |
|--------|------|-------------|
| `file_id` | TEXT PK | Unique file identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `version_id` | TEXT FK → story_versions | Associated version |
| `file_type` | file_type | Type of file (master_story, characters, etc.) |
| `official_filename` | TEXT | Filename (enforced: plot_outline must be 'plot_outline.json') |
| `storage_path` | TEXT | Full path in file storage |
| `state_type` | story_state_type | template_state or story_state |
| `checksum` | TEXT | SHA-256 checksum of file content |
| `json_copy` | JSONB | Lightweight copy for SQL queries (optional) |

**Constraints:** UNIQUE(story_id, version_id, file_type), filename guard on plot_outline

## Event/Update Tables

### `plot_workspaces`

Temporary free-writing sessions. Maps to `plot_workspace.json`.

| Column | Type | Description |
|--------|------|-------------|
| `workspace_id` | TEXT PK | Unique workspace identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `version_id` | TEXT FK → story_versions | Associated version |
| `target_arc_id` | TEXT FK → arcs | Target arc (nullable) |
| `target_chapter_id` | TEXT FK → chapters | Target chapter (nullable) |
| `status` | workspace_status | Current workflow stage |
| `free_text` | TEXT | User's free writing |
| `ai_completion_enabled` | BOOLEAN | Whether AI expansion was used |
| `expansion_mode` | TEXT | Light/Medium/Heavy/etc. |
| `expanded_text` | TEXT | AI-generated expanded text |
| `accepted_expanded_text` | BOOLEAN | Whether user accepted AI text |
| `final_text_used_for_analysis` | TEXT | Text that was analyzed for consequences |
| `workspace_json_path` | TEXT | File storage path to workspace JSON |

### `llm_runs`

Every AI call is tracked for audit and debugging.

| Column | Type | Description |
|--------|------|-------------|
| `llm_run_id` | TEXT PK | Unique run identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `workspace_id` | TEXT FK → plot_workspaces | Associated workspace (nullable) |
| `chapter_id` | TEXT FK → chapters | Associated chapter (nullable) |
| `run_type` | TEXT | ai_completion / consequence_extraction / question_generation / event_proposal / patch_proposal / chapter_script_generation / continuity_check / summary_generation |
| `model_name` | TEXT | LLM model used |
| `prompt_version` | TEXT | Prompt template version |
| `input_payload` | JSONB | Full input sent to LLM |
| `output_payload` | JSONB | Full output from LLM |
| `status` | TEXT | pending / success / error |
| `error_message` | TEXT | Error details if failed |

### `detected_story_events`

LLM-detected possible consequences before they become official.

| Column | Type | Description |
|--------|------|-------------|
| `detected_event_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `workspace_id` | TEXT FK → plot_workspaces | Associated workspace |
| `llm_run_id` | TEXT FK → llm_runs | Source LLM run (nullable) |
| `event_type` | TEXT | e.g., CHARACTER_INJURED, CHARACTER_DIED |
| `event_category` | event_category | Category classification |
| `confidence` | TEXT | high / medium / low |
| `evidence_from_user_text` | TEXT | Quote from user writing as evidence |
| `target_file` | file_type | Which official file this affects |
| `target_entity_id` | TEXT | Character/faction/etc. ID |
| `requires_user_decision` | BOOLEAN | Whether user must answer a question |

### `consequence_questions`

Questions the system asks the user about detected events.

| Column | Type | Description |
|--------|------|-------------|
| `question_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `workspace_id` | TEXT FK → plot_workspaces | Associated workspace |
| `detected_event_id` | TEXT FK → detected_story_events | Source event (nullable) |
| `question` | TEXT | The question text |
| `why_this_matters` | TEXT | Explanation of significance |
| `options` | JSONB | Available answer options |
| `selected` | TEXT | User's selected option |
| `custom_answer` | TEXT | Custom text answer (if "Custom" selected) |

### `user_answers`

User answers to consequence questions.

| Column | Type | Description |
|--------|------|-------------|
| `answer_id` | TEXT PK | Unique identifier |
| `question_id` | TEXT FK → consequence_questions | Source question |
| `selected` | TEXT | Selected option value |
| `custom_answer` | TEXT | Custom answer text |

### `story_events` — **Append-Only Official Event Store**

The core of the event-sourced memory system. Once created, events cannot be updated or deleted.

| Column | Type | Description |
|--------|------|-------------|
| `event_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `version_from` | TEXT FK → story_versions | Version before this event |
| `version_to` | TEXT FK → story_versions | Version after this event (nullable until applied) |
| `event_type` | TEXT | e.g., CHARACTER_DIED, WORLD_RULE_CHANGED |
| `event_category` | event_category | Category classification |
| `target_file` | file_type | Which official file is affected |
| `target_entity_id` | TEXT | Character/faction/etc. ID |
| `summary` | TEXT | Human-readable summary |
| `payload` | JSONB | Full structured event data |
| `approval_status` | approval_status | pending / approved / rejected / needs_revision |

**Append-only trigger:** Prevents UPDATE or DELETE on this table. Compensating events must be inserted instead.

### `json_patches`

Proposed and applied JSON changes.

| Column | Type | Description |
|--------|------|-------------|
| `patch_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `event_id` | TEXT FK → story_events | Associated event (nullable) |
| `workspace_id` | TEXT FK → plot_workspaces | Associated workspace (nullable) |
| `target_file` | file_type | Which file to patch |
| `target_branch` | TEXT | JSON path (e.g., "created_major_character_profiles.char_001.status") |
| `operation` | patch_operation | add / replace / remove / append_to_array / merge_object |
| `old_value` | JSONB | Previous value at target branch |
| `new_value` | JSONB | New value to set |
| `reason` | TEXT | Why this change is needed |

### `approval_queue`

Final confirmation objects that bundle events + patches for user approval.

| Column | Type | Description |
|--------|------|-------------|
| `approval_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `workspace_id` | TEXT FK → plot_workspaces | Associated workspace (nullable) |
| `chapter_id` | TEXT FK → chapters | Associated chapter (nullable) |
| `approval_type` | TEXT | workspace_changes / chapter_script / version_candidate / continuity_fix |
| `status` | approval_status | Current approval status |
| `summary` | JSONB | Human-readable summary of proposed changes |
| `approved_event_ids` | JSONB | Event IDs approved by user |
| `rejected_event_ids` | JSONB | Event IDs rejected by user |

### `chapter_scripts`

Clean manga script outputs.

| Column | Type | Description |
|--------|------|-------------|
| `script_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `version_id` | TEXT FK → story_versions | Associated version |
| `chapter_id` | TEXT FK → chapters | Associated chapter |
| `workspace_id` | TEXT FK → plot_workspaces | Source workspace (nullable) |
| `script_version` | TEXT | draft_001, draft_002, etc. |
| `chapter_status` | TEXT | draft / review / approved |
| `approved_as_official` | BOOLEAN | Whether this script is the official version |

### `continuity_reports`

Continuity warnings and errors detected by the continuity service.

| Column | Type | Description |
|--------|------|-------------|
| `report_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `version_id` | TEXT FK → story_versions | Associated version (nullable) |
| `workspace_id` | TEXT FK → plot_workspaces | Associated workspace (nullable) |
| `report_type` | TEXT | check-workspace / check-version / check-script |
| `status` | TEXT | not_started / running / completed |
| `approved` | BOOLEAN | Whether user accepted the warnings |
| `issues` | JSONB | High/critical severity issues array |
| `warnings` | JSONB | Medium/low severity warnings array |

### `sync_jobs`

Tracks synchronization between PostgreSQL, file storage, Neo4j, and Qdrant.

| Column | Type | Description |
|--------|------|-------------|
| `sync_job_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `version_id` | TEXT FK → story_versions | Associated version (nullable) |
| `target_system` | TEXT | json_snapshots / postgresql / neo4j / qdrant / continuity_report |
| `status` | sync_status | pending / running / success / failed / skipped |

### `event_projections`

Event → graph/vector/json projection payloads.

| Column | Type | Description |
|--------|------|-------------|
| `projection_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `event_id` | TEXT FK → story_events | Source event |
| `target_system` | TEXT | neo4j / qdrant / json_snapshots |
| `projection_payload` | JSONB | Structured payload for target system |

### `vector_chunks`

Metadata mirror for Qdrant vector points. Qdrant stores the actual vectors; PostgreSQL stores metadata for queries.

| Column | Type | Description |
|--------|------|-------------|
| `chunk_id` | TEXT PK | Unique identifier |
| `story_id` | TEXT FK → stories | Parent story |
| `version_id` | TEXT FK → story_versions | Associated version (nullable) |
| `chapter_id` | TEXT FK → chapters | Associated chapter (nullable) |
| `source_file` | file_type | Which official file this chunk came from |
| `chunk_type` | TEXT | scene_summary / character_memory / world_lore / foreshadowing / dialogue / plot_thread |
| `entity_ids` | JSONB | Array of entity IDs (characters, factions, etc.) |

## Indexes

```sql
-- Version lookups
CREATE INDEX idx_story_versions_story_current ON story_versions (story_id, status, version_number DESC);

-- File lookups by version
CREATE INDEX idx_story_files_story_version ON story_files (story_id, version_id, file_type);

-- Event queries
CREATE INDEX idx_story_events_story_version ON story_events (story_id, version_from, version_to);
CREATE INDEX idx_story_events_type ON story_events (story_id, event_type);

-- Workspace analysis lookups
CREATE INDEX idx_detected_events_workspace ON detected_story_events (workspace_id, status);
CREATE INDEX idx_questions_workspace ON consequence_questions (workspace_id, status);
CREATE INDEX idx_patches_workspace ON json_patches (workspace_id, approval_status);

-- Sync job monitoring
CREATE INDEX idx_sync_jobs_status ON sync_jobs (story_id, status);

-- Vector entity lookups
CREATE INDEX idx_vector_chunks_entity_ids ON vector_chunks USING GIN (entity_ids);
```

## Key Design Decisions

1. **JSONB for indexing, file storage for full content** — Full JSON lives in file storage; lightweight JSONB copies in SQL enable queries without loading entire files.
2. **Append-only story_events** — A PostgreSQL trigger prevents UPDATE/DELETE on the event store. Compensating events are inserted instead of modifying existing ones.
3. **Filename guard constraints** — `plot_outline.json` cannot be renamed to `plot_outline(1).json` or similar; enforced at both SQL and application level.
4. **Cascade deletes** — Deleting a story cascades through all related tables (versions, files, events, workspaces, etc.).
