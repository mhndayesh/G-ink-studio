-- Manga Maker System PostgreSQL schema v1.0
-- Production target for the story-state engine. Alembic migration source:
-- migrations/versions/0001_initial_story_state_engine.py

DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'story_state_type') THEN CREATE TYPE story_state_type AS ENUM ('template_state', 'story_state'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'version_status') THEN CREATE TYPE version_status AS ENUM ('draft', 'candidate', 'official', 'archived', 'failed'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'approval_status') THEN CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'needs_revision'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sync_status') THEN CREATE TYPE sync_status AS ENUM ('pending', 'running', 'success', 'failed', 'skipped'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_type') THEN CREATE TYPE file_type AS ENUM ('master_story', 'characters', 'plot_outline', 'memory_system', 'plot_workspace', 'chapter_script', 'version_manifest'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workspace_status') THEN CREATE TYPE workspace_status AS ENUM ('not_started', 'free_writing', 'ai_completion_ready', 'ai_completion_done', 'analysis_ready', 'questions_pending', 'confirmation_ready', 'approved', 'rejected', 'archived'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_category') THEN CREATE TYPE event_category AS ENUM ('character_events', 'relationship_events', 'power_events', 'world_events', 'faction_events', 'threat_events', 'plot_events', 'system_events'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patch_operation') THEN CREATE TYPE patch_operation AS ENUM ('add', 'replace', 'remove', 'append_to_array', 'merge_object'); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'severity_level') THEN CREATE TYPE severity_level AS ENUM ('low', 'medium', 'high', 'critical'); END IF; END $$;

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stories (
  story_id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  current_version_id TEXT,
  state_type story_state_type NOT NULL DEFAULT 'template_state',
  official_plot_outline_filename TEXT NOT NULL DEFAULT 'plot_outline.json',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT official_plot_outline_filename_check CHECK (official_plot_outline_filename = 'plot_outline.json')
);

CREATE TABLE IF NOT EXISTS arcs (
  arc_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  arc_number INTEGER NOT NULL,
  arc_title TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, arc_number)
);

CREATE TABLE IF NOT EXISTS chapters (
  chapter_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_number INTEGER NOT NULL,
  chapter_title TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, chapter_number)
);

CREATE TABLE IF NOT EXISTS story_versions (
  version_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  previous_version_id TEXT REFERENCES story_versions(version_id),
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  status version_status NOT NULL DEFAULT 'draft',
  state_type story_state_type NOT NULL DEFAULT 'template_state',
  snapshot_folder_path TEXT NOT NULL,
  created_from_event_ids JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  marked_official_at TIMESTAMPTZ,
  UNIQUE (story_id, version_number),
  CONSTRAINT version_number_positive CHECK (version_number > 0)
);

CREATE TABLE IF NOT EXISTS story_files (
  file_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE CASCADE,
  file_type file_type NOT NULL,
  official_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  state_type story_state_type NOT NULL DEFAULT 'template_state',
  checksum TEXT,
  json_copy JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (story_id, version_id, file_type),
  CONSTRAINT plot_outline_filename_guard CHECK (file_type != 'plot_outline' OR official_filename = 'plot_outline.json')
);

CREATE TABLE IF NOT EXISTS plot_workspaces (
  workspace_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES story_versions(version_id),
  target_arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  target_chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  target_scene_id TEXT,
  status workspace_status NOT NULL DEFAULT 'not_started',
  free_text TEXT,
  ai_completion_enabled BOOLEAN NOT NULL DEFAULT false,
  expansion_mode TEXT,
  expanded_text TEXT,
  accepted_expanded_text BOOLEAN NOT NULL DEFAULT false,
  final_text_used_for_analysis TEXT,
  workspace_json_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS llm_runs (
  llm_run_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  run_type TEXT NOT NULL,
  model_name TEXT,
  prompt_version TEXT NOT NULL,
  input_payload JSONB NOT NULL,
  output_payload JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS detected_story_events (
  detected_event_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  llm_run_id TEXT REFERENCES llm_runs(llm_run_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_category event_category NOT NULL,
  confidence TEXT NOT NULL,
  evidence_from_user_text TEXT,
  target_file file_type,
  target_entity_id TEXT,
  target_entity_name TEXT,
  requires_user_decision BOOLEAN NOT NULL DEFAULT false,
  reason_question_is_needed TEXT,
  suggested_event_summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consequence_questions (
  question_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  detected_event_id TEXT REFERENCES detected_story_events(detected_event_id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  why_this_matters TEXT,
  options JSONB NOT NULL,
  selected TEXT,
  custom_answer TEXT,
  status TEXT NOT NULL DEFAULT 'unanswered',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS user_answers (
  answer_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES consequence_questions(question_id) ON DELETE CASCADE,
  selected TEXT,
  custom_answer TEXT,
  answer_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS story_events (
  event_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT,
  version_from TEXT NOT NULL REFERENCES story_versions(version_id),
  version_to TEXT REFERENCES story_versions(version_id),
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_category event_category NOT NULL,
  target_file file_type NOT NULL,
  target_entity_id TEXT,
  summary TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_from_detected_event_id TEXT REFERENCES detected_story_events(detected_event_id),
  created_from_question_id TEXT REFERENCES consequence_questions(question_id),
  approval_status approval_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS json_patches (
  patch_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  event_id TEXT REFERENCES story_events(event_id) ON DELETE CASCADE,
  target_file file_type NOT NULL,
  target_branch TEXT NOT NULL,
  operation patch_operation NOT NULL,
  old_value JSONB,
  new_value JSONB,
  reason TEXT,
  approval_status approval_status NOT NULL DEFAULT 'pending',
  applied_version_id TEXT REFERENCES story_versions(version_id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS approval_queue (
  approval_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE CASCADE,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  approval_type TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  summary JSONB NOT NULL,
  approved_event_ids JSONB NOT NULL DEFAULT '[]',
  rejected_event_ids JSONB NOT NULL DEFAULT '[]',
  approved_patch_ids JSONB NOT NULL DEFAULT '[]',
  rejected_patch_ids JSONB NOT NULL DEFAULT '[]',
  user_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS chapter_scripts (
  script_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES story_versions(version_id),
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT NOT NULL REFERENCES chapters(chapter_id) ON DELETE CASCADE,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  script_version TEXT NOT NULL DEFAULT 'draft_001',
  chapter_status TEXT NOT NULL DEFAULT 'draft',
  approved_as_official BOOLEAN NOT NULL DEFAULT false,
  script_json_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS continuity_reports (
  report_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE SET NULL,
  workspace_id TEXT REFERENCES plot_workspaces(workspace_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  approved BOOLEAN NOT NULL DEFAULT false,
  issues JSONB NOT NULL DEFAULT '[]',
  warnings JSONB NOT NULL DEFAULT '[]',
  fix_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_jobs (
  sync_job_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE SET NULL,
  event_id TEXT REFERENCES story_events(event_id) ON DELETE SET NULL,
  target_system TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input_payload JSONB,
  output_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS event_projections (
  projection_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES story_events(event_id) ON DELETE CASCADE,
  target_system TEXT NOT NULL,
  projection_payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vector_chunks (
  chunk_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(story_id) ON DELETE CASCADE,
  version_id TEXT REFERENCES story_versions(version_id) ON DELETE SET NULL,
  arc_id TEXT REFERENCES arcs(arc_id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(chapter_id) ON DELETE SET NULL,
  scene_id TEXT,
  source_file file_type NOT NULL,
  chunk_type TEXT NOT NULL,
  entity_ids JSONB NOT NULL DEFAULT '[]',
  qdrant_collection TEXT NOT NULL,
  text_preview TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION prevent_story_event_update()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'story_events is append-only. Insert compensating event instead.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS story_events_no_update ON story_events;
CREATE TRIGGER story_events_no_update
BEFORE UPDATE OR DELETE ON story_events
FOR EACH ROW EXECUTE FUNCTION prevent_story_event_update();

CREATE INDEX IF NOT EXISTS idx_story_versions_story_current ON story_versions (story_id, status, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_story_files_story_version ON story_files (story_id, version_id, file_type);
CREATE INDEX IF NOT EXISTS idx_story_events_story_workspace ON story_events (story_id, workspace_id, event_type);
CREATE INDEX IF NOT EXISTS idx_json_patches_story_workspace ON json_patches (story_id, workspace_id, target_file);
CREATE INDEX IF NOT EXISTS idx_detected_events_workspace ON detected_story_events (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_questions_workspace ON consequence_questions (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_continuity_reports_story_version ON continuity_reports (story_id, version_id, report_type);
CREATE INDEX IF NOT EXISTS idx_event_projections_story_target ON event_projections (story_id, target_system, event_id);
CREATE INDEX IF NOT EXISTS idx_vector_chunks_story_version ON vector_chunks (story_id, version_id, chunk_type);
