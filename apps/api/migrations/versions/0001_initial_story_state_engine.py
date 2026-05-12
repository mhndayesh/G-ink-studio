"""Initial Manga Maker story-state engine schema.

Revision ID: 0001_initial_story_state_engine
Revises: 
Create Date: 2026-05-04
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_initial_story_state_engine"
down_revision = None
branch_labels = None
depends_on = None


def _create_enum(enum_name: str, values: list[str]) -> None:
    values_sql = ", ".join([f"'{v}'" for v in values])
    op.execute(
        f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '{enum_name}') THEN
                CREATE TYPE {enum_name} AS ENUM ({values_sql});
            END IF;
        END$$;
        """
    )


def upgrade() -> None:
    _create_enum("story_state_type", ["template_state", "story_state"])
    _create_enum("version_status", ["draft", "candidate", "official", "archived", "failed"])
    _create_enum("approval_status", ["pending", "approved", "rejected", "needs_revision"])
    _create_enum("sync_status", ["pending", "running", "success", "failed", "skipped"])
    _create_enum("file_type", ["master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script", "version_manifest"])
    _create_enum("workspace_status", ["not_started", "free_writing", "ai_completion_ready", "ai_completion_done", "analysis_ready", "questions_pending", "confirmation_ready", "approved", "rejected", "archived"])
    _create_enum("event_category", ["character_events", "relationship_events", "power_events", "world_events", "faction_events", "threat_events", "plot_events", "system_events"])
    _create_enum("patch_operation", ["add", "replace", "remove", "append_to_array", "merge_object"])
    _create_enum("severity_level", ["low", "medium", "high", "critical"])

    story_state = postgresql.ENUM("template_state", "story_state", name="story_state_type", create_type=False)
    version_status = postgresql.ENUM("draft", "candidate", "official", "archived", "failed", name="version_status", create_type=False)
    approval_status = postgresql.ENUM("pending", "approved", "rejected", "needs_revision", name="approval_status", create_type=False)
    file_type = postgresql.ENUM("master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script", "version_manifest", name="file_type", create_type=False)
    workspace_status = postgresql.ENUM("not_started", "free_writing", "ai_completion_ready", "ai_completion_done", "analysis_ready", "questions_pending", "confirmation_ready", "approved", "rejected", "archived", name="workspace_status", create_type=False)
    event_category = postgresql.ENUM("character_events", "relationship_events", "power_events", "world_events", "faction_events", "threat_events", "plot_events", "system_events", name="event_category", create_type=False)
    patch_operation = postgresql.ENUM("add", "replace", "remove", "append_to_array", "merge_object", name="patch_operation", create_type=False)

    op.create_table(
        "users",
        sa.Column("user_id", sa.Text(), primary_key=True),
        sa.Column("email", sa.Text(), unique=True),
        sa.Column("display_name", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "stories",
        sa.Column("story_id", sa.Text(), primary_key=True),
        sa.Column("user_id", sa.Text(), sa.ForeignKey("users.user_id", ondelete="CASCADE")),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("current_version_id", sa.Text()),
        sa.Column("state_type", story_state, nullable=False, server_default="template_state"),
        sa.Column("official_plot_outline_filename", sa.Text(), nullable=False, server_default="plot_outline.json"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("official_plot_outline_filename = 'plot_outline.json'", name="official_plot_outline_filename_check"),
    )
    op.create_table(
        "arcs",
        sa.Column("arc_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("arc_number", sa.Integer(), nullable=False),
        sa.Column("arc_title", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default="planned"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("story_id", "arc_number", name="uq_arcs_story_number"),
    )
    op.create_table(
        "chapters",
        sa.Column("chapter_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("arc_id", sa.Text(), sa.ForeignKey("arcs.arc_id", ondelete="SET NULL")),
        sa.Column("chapter_number", sa.Integer(), nullable=False),
        sa.Column("chapter_title", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default="planned"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("story_id", "chapter_number", name="uq_chapters_story_number"),
    )
    op.create_table(
        "story_versions",
        sa.Column("version_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("previous_version_id", sa.Text(), sa.ForeignKey("story_versions.version_id")),
        sa.Column("arc_id", sa.Text(), sa.ForeignKey("arcs.arc_id", ondelete="SET NULL")),
        sa.Column("chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="SET NULL")),
        sa.Column("status", version_status, nullable=False, server_default="draft"),
        sa.Column("state_type", story_state, nullable=False, server_default="template_state"),
        sa.Column("snapshot_folder_path", sa.Text(), nullable=False),
        sa.Column("created_from_event_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("marked_official_at", sa.TIMESTAMP(timezone=True)),
        sa.UniqueConstraint("story_id", "version_number", name="uq_story_versions_story_number"),
        sa.CheckConstraint("version_number > 0", name="version_number_positive"),
    )
    op.create_table(
        "story_files",
        sa.Column("file_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Text(), sa.ForeignKey("story_versions.version_id", ondelete="CASCADE")),
        sa.Column("file_type", file_type, nullable=False),
        sa.Column("official_filename", sa.Text(), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("state_type", story_state, nullable=False, server_default="template_state"),
        sa.Column("checksum", sa.Text()),
        sa.Column("json_copy", postgresql.JSONB()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("story_id", "version_id", "file_type", name="uq_story_files_story_version_type"),
        sa.CheckConstraint("file_type != 'plot_outline' OR official_filename = 'plot_outline.json'", name="plot_outline_filename_guard"),
    )
    op.create_table(
        "plot_workspaces",
        sa.Column("workspace_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Text(), sa.ForeignKey("story_versions.version_id"), nullable=False),
        sa.Column("target_arc_id", sa.Text(), sa.ForeignKey("arcs.arc_id", ondelete="SET NULL")),
        sa.Column("target_chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="SET NULL")),
        sa.Column("target_scene_id", sa.Text()),
        sa.Column("status", workspace_status, nullable=False, server_default="not_started"),
        sa.Column("free_text", sa.Text()),
        sa.Column("ai_completion_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("expansion_mode", sa.Text()),
        sa.Column("expanded_text", sa.Text()),
        sa.Column("accepted_expanded_text", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("final_text_used_for_analysis", sa.Text()),
        sa.Column("workspace_json_path", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "llm_runs",
        sa.Column("llm_run_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="SET NULL")),
        sa.Column("chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="SET NULL")),
        sa.Column("run_type", sa.Text(), nullable=False),
        sa.Column("model_name", sa.Text()),
        sa.Column("prompt_version", sa.Text(), nullable=False),
        sa.Column("input_payload", postgresql.JSONB(), nullable=False),
        sa.Column("output_payload", postgresql.JSONB()),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "detected_story_events",
        sa.Column("detected_event_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="CASCADE")),
        sa.Column("llm_run_id", sa.Text(), sa.ForeignKey("llm_runs.llm_run_id", ondelete="SET NULL")),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("event_category", event_category, nullable=False),
        sa.Column("confidence", sa.Text(), nullable=False),
        sa.Column("evidence_from_user_text", sa.Text()),
        sa.Column("target_file", file_type),
        sa.Column("target_entity_id", sa.Text()),
        sa.Column("target_entity_name", sa.Text()),
        sa.Column("requires_user_decision", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("reason_question_is_needed", sa.Text()),
        sa.Column("suggested_event_summary", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending_review"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "consequence_questions",
        sa.Column("question_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="CASCADE"), nullable=False),
        sa.Column("detected_event_id", sa.Text(), sa.ForeignKey("detected_story_events.detected_event_id", ondelete="SET NULL")),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("why_this_matters", sa.Text()),
        sa.Column("options", postgresql.JSONB(), nullable=False),
        sa.Column("selected", sa.Text()),
        sa.Column("custom_answer", sa.Text()),
        sa.Column("status", sa.Text(), nullable=False, server_default="unanswered"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("answered_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "user_answers",
        sa.Column("answer_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.Text(), sa.ForeignKey("consequence_questions.question_id", ondelete="CASCADE"), nullable=False),
        sa.Column("selected", sa.Text()),
        sa.Column("custom_answer", sa.Text()),
        sa.Column("answer_status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "story_events",
        sa.Column("event_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text()),
        sa.Column("version_from", sa.Text(), sa.ForeignKey("story_versions.version_id"), nullable=False),
        sa.Column("version_to", sa.Text(), sa.ForeignKey("story_versions.version_id")),
        sa.Column("arc_id", sa.Text(), sa.ForeignKey("arcs.arc_id", ondelete="SET NULL")),
        sa.Column("chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="SET NULL")),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("event_category", event_category, nullable=False),
        sa.Column("target_file", file_type, nullable=False),
        sa.Column("target_entity_id", sa.Text()),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("created_from_detected_event_id", sa.Text(), sa.ForeignKey("detected_story_events.detected_event_id")),
        sa.Column("created_from_question_id", sa.Text(), sa.ForeignKey("consequence_questions.question_id")),
        sa.Column("approval_status", approval_status, nullable=False, server_default="pending"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "json_patches",
        sa.Column("patch_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="SET NULL")),
        sa.Column("event_id", sa.Text(), sa.ForeignKey("story_events.event_id", ondelete="CASCADE")),
        sa.Column("target_file", file_type, nullable=False),
        sa.Column("target_branch", sa.Text(), nullable=False),
        sa.Column("operation", patch_operation, nullable=False),
        sa.Column("old_value", postgresql.JSONB()),
        sa.Column("new_value", postgresql.JSONB()),
        sa.Column("reason", sa.Text()),
        sa.Column("approval_status", approval_status, nullable=False, server_default="pending"),
        sa.Column("applied_version_id", sa.Text(), sa.ForeignKey("story_versions.version_id")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("applied_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "approval_queue",
        sa.Column("approval_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="CASCADE")),
        sa.Column("chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="SET NULL")),
        sa.Column("approval_type", sa.Text(), nullable=False),
        sa.Column("status", approval_status, nullable=False, server_default="pending"),
        sa.Column("summary", postgresql.JSONB(), nullable=False),
        sa.Column("approved_event_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("rejected_event_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("approved_patch_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("rejected_patch_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("user_note", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("resolved_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "chapter_scripts",
        sa.Column("script_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Text(), sa.ForeignKey("story_versions.version_id"), nullable=False),
        sa.Column("arc_id", sa.Text(), sa.ForeignKey("arcs.arc_id", ondelete="SET NULL")),
        sa.Column("chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="SET NULL")),
        sa.Column("script_version", sa.Text(), nullable=False, server_default="draft_001"),
        sa.Column("chapter_status", sa.Text(), nullable=False, server_default="draft"),
        sa.Column("approved_as_official", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("script_json_path", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("approved_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "continuity_reports",
        sa.Column("report_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Text(), sa.ForeignKey("story_versions.version_id", ondelete="SET NULL")),
        sa.Column("workspace_id", sa.Text(), sa.ForeignKey("plot_workspaces.workspace_id", ondelete="SET NULL")),
        sa.Column("chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="SET NULL")),
        sa.Column("report_type", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="not_started"),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("issues", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("warnings", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("fix_notes", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_table(
        "sync_jobs",
        sa.Column("sync_job_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Text(), sa.ForeignKey("story_versions.version_id", ondelete="SET NULL")),
        sa.Column("event_id", sa.Text(), sa.ForeignKey("story_events.event_id", ondelete="SET NULL")),
        sa.Column("target_system", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("input_payload", postgresql.JSONB()),
        sa.Column("output_payload", postgresql.JSONB()),
        sa.Column("error_message", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "event_projections",
        sa.Column("projection_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("event_id", sa.Text(), sa.ForeignKey("story_events.event_id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_system", sa.Text(), nullable=False),
        sa.Column("projection_payload", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("status", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("applied_at", sa.TIMESTAMP(timezone=True)),
    )
    op.create_table(
        "vector_chunks",
        sa.Column("chunk_id", sa.Text(), primary_key=True),
        sa.Column("story_id", sa.Text(), sa.ForeignKey("stories.story_id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_id", sa.Text(), sa.ForeignKey("story_versions.version_id", ondelete="SET NULL")),
        sa.Column("arc_id", sa.Text(), sa.ForeignKey("arcs.arc_id", ondelete="SET NULL")),
        sa.Column("chapter_id", sa.Text(), sa.ForeignKey("chapters.chapter_id", ondelete="SET NULL")),
        sa.Column("scene_id", sa.Text()),
        sa.Column("source_file", file_type, nullable=False),
        sa.Column("chunk_type", sa.Text(), nullable=False),
        sa.Column("entity_ids", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column("qdrant_collection", sa.Text(), nullable=False),
        sa.Column("text_preview", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("idx_story_versions_story_current", "story_versions", ["story_id", "status", "version_number"])
    op.create_index("idx_story_files_story_version", "story_files", ["story_id", "version_id", "file_type"])
    op.create_index("idx_story_events_story_workspace", "story_events", ["story_id", "workspace_id", "event_type"])
    op.create_index("idx_json_patches_story_workspace", "json_patches", ["story_id", "workspace_id", "target_file"])
    op.create_index("idx_detected_events_workspace", "detected_story_events", ["workspace_id", "status"])
    op.create_index("idx_questions_workspace", "consequence_questions", ["workspace_id", "status"])
    op.create_index("idx_continuity_reports_story_version", "continuity_reports", ["story_id", "version_id", "report_type"])
    op.create_index("idx_event_projections_story_target", "event_projections", ["story_id", "target_system", "event_id"])
    op.create_index("idx_vector_chunks_story_version", "vector_chunks", ["story_id", "version_id", "chunk_type"])

    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_story_event_update()
        RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'story_events is append-only. Insert compensating event instead.';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute("DROP TRIGGER IF EXISTS story_events_no_update ON story_events;")
    op.execute(
        """
        CREATE TRIGGER story_events_no_update
        BEFORE UPDATE OR DELETE ON story_events
        FOR EACH ROW EXECUTE FUNCTION prevent_story_event_update();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS story_events_no_update ON story_events;")
    op.execute("DROP FUNCTION IF EXISTS prevent_story_event_update();")
    for table in [
        "vector_chunks", "event_projections", "sync_jobs", "continuity_reports", "chapter_scripts",
        "approval_queue", "json_patches", "story_events", "user_answers", "consequence_questions",
        "detected_story_events", "llm_runs", "plot_workspaces", "story_files", "story_versions",
        "chapters", "arcs", "stories", "users",
    ]:
        op.drop_table(table, if_exists=True)
    for enum_name in [
        "severity_level", "patch_operation", "event_category", "workspace_status", "file_type",
        "sync_status", "approval_status", "version_status", "story_state_type",
    ]:
        op.execute(f"DROP TYPE IF EXISTS {enum_name};")
