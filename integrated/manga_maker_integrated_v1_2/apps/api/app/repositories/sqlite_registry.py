from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stories (
  story_id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT NOT NULL,
  current_version_id TEXT NOT NULL,
  state_type TEXT NOT NULL,
  official_plot_outline_filename TEXT NOT NULL DEFAULT 'plot_outline.json',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  previous_version_id TEXT,
  status TEXT NOT NULL,
  state_type TEXT NOT NULL,
  snapshot_folder_path TEXT NOT NULL,
  created_from_event_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  marked_official_at TEXT,
  UNIQUE(story_id, version_number)
);

CREATE TABLE IF NOT EXISTS story_files (
  file_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  file_type TEXT NOT NULL,
  official_filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  state_type TEXT NOT NULL,
  checksum TEXT NOT NULL,
  json_copy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(story_id, version_id, file_type)
);

CREATE TABLE IF NOT EXISTS story_events (
  event_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  workspace_id TEXT,
  version_from TEXT NOT NULL,
  version_to TEXT,
  event_type TEXT NOT NULL,
  event_category TEXT NOT NULL,
  target_file TEXT NOT NULL,
  target_entity_id TEXT,
  summary TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_from_detected_event_id TEXT,
  created_from_question_id TEXT,
  approval_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS json_patches (
  patch_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  workspace_id TEXT,
  event_id TEXT,
  target_file TEXT NOT NULL,
  target_branch TEXT NOT NULL,
  operation TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  approval_status TEXT NOT NULL,
  applied_version_id TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS continuity_reports (
  report_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  version_id TEXT,
  report_type TEXT NOT NULL,
  status TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  issues TEXT NOT NULL,
  warnings TEXT NOT NULL,
  fix_notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_projections (
  projection_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  target_system TEXT NOT NULL,
  projection_payload TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT
);


CREATE TABLE IF NOT EXISTS llm_runs (
  llm_run_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  workspace_id TEXT,
  run_type TEXT NOT NULL,
  model_name TEXT,
  prompt_version TEXT NOT NULL,
  input_payload TEXT NOT NULL,
  output_payload TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS vector_chunks (
  chunk_id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  version_id TEXT,
  arc_id TEXT,
  chapter_id TEXT,
  scene_id TEXT,
  source_file TEXT NOT NULL,
  chunk_type TEXT NOT NULL,
  entity_ids TEXT NOT NULL,
  qdrant_collection TEXT NOT NULL,
  text_preview TEXT,
  created_at TEXT NOT NULL
);

"""


class SQLiteRegistry:
    """Small dev/smoke-test registry. Production target is PostgreSQL schema.sql."""

    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._init()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init(self) -> None:
        with self._connect() as conn:
            self._migrate_story_versions_v1(conn)
            conn.executescript(SCHEMA)
            self._ensure_column(conn, table="stories", column="user_id", definition="TEXT")
            self._ensure_column(conn, table="story_files", column="updated_at", definition="TEXT")

    def _migrate_story_versions_v1(self, conn: sqlite3.Connection) -> None:
        # Old schema had `version_id TEXT PRIMARY KEY` which made version_id globally
        # unique — breaking creation of any story after the first. New schema uses
        # `id INTEGER PRIMARY KEY AUTOINCREMENT` so version_id is only unique per story.
        rows = conn.execute("PRAGMA table_info(story_versions)").fetchall()
        if not rows:
            return  # table not yet created; CREATE TABLE IF NOT EXISTS will handle it
        col_names = {row["name"] for row in rows}
        if "id" in col_names:
            return  # already on new schema
        conn.executescript("""
            ALTER TABLE story_versions RENAME TO story_versions_old;
            CREATE TABLE story_versions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              version_id TEXT NOT NULL,
              story_id TEXT NOT NULL,
              version_number INTEGER NOT NULL,
              previous_version_id TEXT,
              status TEXT NOT NULL,
              state_type TEXT NOT NULL,
              snapshot_folder_path TEXT NOT NULL,
              created_from_event_ids TEXT NOT NULL,
              created_at TEXT NOT NULL,
              marked_official_at TEXT,
              UNIQUE(story_id, version_number)
            );
            INSERT INTO story_versions(version_id, story_id, version_number, previous_version_id,
                                       status, state_type, snapshot_folder_path,
                                       created_from_event_ids, created_at, marked_official_at)
            SELECT version_id, story_id, version_number, previous_version_id,
                   status, state_type, snapshot_folder_path,
                   created_from_event_ids, created_at, marked_official_at
            FROM story_versions_old;
            DROP TABLE story_versions_old;
        """)

    def _ensure_column(self, conn: sqlite3.Connection, *, table: str, column: str, definition: str) -> None:
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
        existing = {row["name"] for row in rows}
        if column not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")

    def ensure_user(self, *, user_id: str, email: str | None = None, display_name: str | None = None) -> None:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO users(user_id, email, display_name, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    email = COALESCE(excluded.email, users.email),
                    display_name = COALESCE(excluded.display_name, users.display_name),
                    updated_at = excluded.updated_at
                """,
                (user_id, email, display_name, now, now),
            )

    def get_user(self, user_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
            return dict(row) if row else None

    def next_story_number(self) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(CAST(SUBSTR(story_id, 7) AS INTEGER)), 0) AS m FROM stories"
            ).fetchone()
            return int(row["m"]) + 1

    def next_story_number_for_user(self, user_id: str) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COALESCE(MAX(CAST(SUBSTR(story_id, 7) AS INTEGER)), 0) AS m FROM stories WHERE user_id = ?",
                (user_id,),
            ).fetchone()
            return int(row["m"]) + 1

    def create_story(self, *, story_id: str, user_id: str, title: str, version_id: str, now: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO stories(story_id, user_id, title, current_version_id, state_type, official_plot_outline_filename, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'template_state', 'plot_outline.json', ?, ?)
                """,
                (story_id, user_id, title, version_id, now, now),
            )

    def create_version(self, *, story_id: str, version_id: str, version_number: int, snapshot_folder_path: str, now: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO story_versions(version_id, story_id, version_number, previous_version_id, status, state_type,
                                           snapshot_folder_path, created_from_event_ids, created_at, marked_official_at)
                VALUES (?, ?, ?, NULL, 'official', 'template_state', ?, '[]', ?, ?)
                """,
                (version_id, story_id, version_number, snapshot_folder_path, now, now),
            )

    def create_file_records(self, records: list[dict[str, Any]], now: str) -> None:
        with self._connect() as conn:
            for rec in records:
                conn.execute(
                    """
                    INSERT INTO story_files(file_id, story_id, version_id, file_type, official_filename, storage_path,
                                            state_type, checksum, json_copy, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        rec["file_id"],
                        rec["story_id"],
                        rec["version_id"],
                        rec["file_type"],
                        rec["official_filename"],
                        rec["storage_path"],
                        rec["state_type"],
                        rec["checksum"],
                        json.dumps(rec["json_copy"], ensure_ascii=False),
                        now,
                    ),
                )

    def get_story(self, story_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM stories WHERE story_id = ?", (story_id,)).fetchone()
            return dict(row) if row else None

    def get_story_by_title(self, user_id: str, title: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM stories WHERE user_id = ? AND title = ?", (user_id, title)).fetchone()
            return dict(row) if row else None

    def list_stories_for_user(self, user_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM stories WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def delete_story(self, story_id: str) -> bool:
        with self._connect() as conn:
            cursor = conn.execute("DELETE FROM stories WHERE story_id = ?", (story_id,))
            for table in (
                "story_versions",
                "story_files",
                "story_events",
                "json_patches",
                "continuity_reports",
                "event_projections",
                "llm_runs",
                "vector_chunks",
            ):
                conn.execute(f"DELETE FROM {table} WHERE story_id = ?", (story_id,))
            conn.commit()
            return cursor.rowcount > 0

    def get_current_files(self, story_id: str) -> list[dict[str, Any]]:
        story = self.get_story(story_id)
        if not story:
            return []
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM story_files WHERE story_id = ? AND version_id = ? ORDER BY file_type",
                (story_id, story["current_version_id"]),
            ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["json_copy"] = json.loads(data["json_copy"])
                result.append(data)
            return result

    def get_version(self, story_id: str, version_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM story_versions WHERE story_id = ? AND version_id = ?",
                (story_id, version_id),
            ).fetchone()
            return dict(row) if row else None

    def get_current_file(self, story_id: str, file_type: str) -> dict[str, Any] | None:
        story = self.get_story(story_id)
        if not story:
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM story_files WHERE story_id = ? AND version_id = ? AND file_type = ?",
                (story_id, story["current_version_id"], file_type),
            ).fetchone()
            if not row:
                return None
            data = dict(row)
            data["json_copy"] = json.loads(data["json_copy"])
            return data

    def update_file_json_copy(self, *, story_id: str, version_id: str, file_type: str, json_copy: dict[str, Any], checksum: str, now: str) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE story_files
                SET json_copy = ?, checksum = ?, updated_at = ?
                WHERE story_id = ? AND version_id = ? AND file_type = ?
                """,
                (json.dumps(json_copy, ensure_ascii=False), checksum, now, story_id, version_id, file_type),
            )
            conn.execute(
                "UPDATE stories SET updated_at = ? WHERE story_id = ?",
                (now, story_id),
            )


    def get_story_events(self, story_id: str, workspace_id: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if workspace_id:
                rows = conn.execute(
                    "SELECT * FROM story_events WHERE story_id = ? AND workspace_id = ? ORDER BY created_at, event_id",
                    (story_id, workspace_id),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM story_events WHERE story_id = ? ORDER BY created_at, event_id",
                    (story_id,),
                ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["payload"] = json.loads(data["payload"])
                result.append(data)
            return result

    def get_json_patches(self, story_id: str, workspace_id: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if workspace_id:
                rows = conn.execute(
                    "SELECT * FROM json_patches WHERE story_id = ? AND workspace_id = ? ORDER BY created_at, patch_id",
                    (story_id, workspace_id),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM json_patches WHERE story_id = ? ORDER BY created_at, patch_id",
                    (story_id,),
                ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["old_value"] = json.loads(data["old_value"]) if data.get("old_value") is not None else None
                data["new_value"] = json.loads(data["new_value"]) if data.get("new_value") is not None else None
                result.append(data)
            return result

    def create_story_events(self, events: list[dict[str, Any]]) -> None:
        with self._connect() as conn:
            for event in events:
                conn.execute(
                    """
                    INSERT INTO story_events(event_id, story_id, workspace_id, version_from, version_to, event_type, event_category,
                                             target_file, target_entity_id, summary, payload, created_from_detected_event_id,
                                             created_from_question_id, approval_status, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        event["event_id"],
                        event["story_id"],
                        event.get("workspace_id"),
                        event["version_from"],
                        event.get("version_to"),
                        event["event_type"],
                        event["event_category"],
                        event["target_file"],
                        event.get("target_entity_id"),
                        event["summary"],
                        json.dumps(event.get("payload", {}), ensure_ascii=False),
                        event.get("created_from_detected_event_id"),
                        event.get("created_from_question_id"),
                        event.get("approval_status", "approved"),
                        event["created_at"],
                    ),
                )

    def create_json_patches(self, patches: list[dict[str, Any]]) -> None:
        with self._connect() as conn:
            for patch in patches:
                conn.execute(
                    """
                    INSERT INTO json_patches(patch_id, story_id, workspace_id, event_id, target_file, target_branch,
                                             operation, old_value, new_value, reason, approval_status, applied_version_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        patch["patch_id"],
                        patch["story_id"],
                        patch.get("workspace_id"),
                        patch.get("event_id"),
                        patch["target_file"],
                        patch["target_branch"],
                        patch["operation"],
                        json.dumps(patch.get("old_value"), ensure_ascii=False) if "old_value" in patch else None,
                        json.dumps(patch.get("new_value"), ensure_ascii=False) if "new_value" in patch else None,
                        patch.get("reason", ""),
                        patch.get("approval_status", "approved"),
                        patch.get("applied_version_id"),
                        patch["created_at"],
                    ),
                )

    def list_files_across_versions(self, story_id: str, file_type: str) -> list[dict[str, Any]]:
        """Return one row per version for a given file_type, oldest version first.

        Used by export aggregators that need to walk every approved/snapshotted
        copy of a file (e.g. chapter_script.json across v001..vNN).
        """
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT sf.*, sv.version_number, sv.status AS version_status
                FROM story_files sf
                JOIN story_versions sv ON sv.story_id = sf.story_id AND sv.version_id = sf.version_id
                WHERE sf.story_id = ? AND sf.file_type = ?
                ORDER BY sv.version_number
                """,
                (story_id, file_type),
            ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["json_copy"] = json.loads(data["json_copy"])
                result.append(data)
            return result

    def get_files_for_version(self, story_id: str, version_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM story_files WHERE story_id = ? AND version_id = ? ORDER BY file_type",
                (story_id, version_id),
            ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["json_copy"] = json.loads(data["json_copy"])
                result.append(data)
            return result

    def next_version_number(self, story_id: str) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COALESCE(MAX(version_number), 0) AS m FROM story_versions WHERE story_id = ?", (story_id,)).fetchone()
            return int(row["m"]) + 1

    def create_version_with_previous(
        self,
        *,
        story_id: str,
        version_id: str,
        version_number: int,
        previous_version_id: str,
        status: str,
        state_type: str,
        snapshot_folder_path: str,
        created_from_event_ids: list[str],
        now: str,
        marked_official_at: str | None = None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO story_versions(version_id, story_id, version_number, previous_version_id, status, state_type,
                                           snapshot_folder_path, created_from_event_ids, created_at, marked_official_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    version_id,
                    story_id,
                    version_number,
                    previous_version_id,
                    status,
                    state_type,
                    snapshot_folder_path,
                    json.dumps(created_from_event_ids, ensure_ascii=False),
                    now,
                    marked_official_at,
                ),
            )

    def version_exists(self, story_id: str, version_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM story_versions WHERE story_id = ? AND version_id = ?",
                (story_id, version_id),
            ).fetchone()
            return bool(row)

    def update_patches_applied(self, *, patch_ids: list[str], applied_version_id: str) -> None:
        with self._connect() as conn:
            for patch_id in patch_ids:
                conn.execute(
                    "UPDATE json_patches SET applied_version_id = ? WHERE patch_id = ?",
                    (applied_version_id, patch_id),
                )

    def update_events_version_to(self, *, event_ids: list[str], version_to: str) -> None:
        with self._connect() as conn:
            for event_id in event_ids:
                conn.execute(
                    "UPDATE story_events SET version_to = ? WHERE event_id = ?",
                    (version_to, event_id),
                )

    def mark_version_official(self, *, story_id: str, version_id: str, now: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "UPDATE story_versions SET status = 'archived' WHERE story_id = ? AND status = 'official' AND version_id != ?",
                (story_id, version_id),
            )
            conn.execute(
                "UPDATE story_versions SET status = 'official', marked_official_at = ? WHERE story_id = ? AND version_id = ?",
                (now, story_id, version_id),
            )
            conn.execute(
                "UPDATE stories SET current_version_id = ?, updated_at = ? WHERE story_id = ?",
                (version_id, now, story_id),
            )

    def list_versions(self, story_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM story_versions WHERE story_id = ? ORDER BY version_number",
                (story_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def create_continuity_report(self, report: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO continuity_reports(report_id, story_id, version_id, report_type, status, approved,
                                                          issues, warnings, fix_notes, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    report["report_id"],
                    report["story_id"],
                    report.get("version_id"),
                    report["report_type"],
                    report.get("status", "completed"),
                    1 if report.get("approved") else 0,
                    json.dumps(report.get("issues", []), ensure_ascii=False),
                    json.dumps(report.get("warnings", []), ensure_ascii=False),
                    report.get("fix_notes", ""),
                    report["created_at"],
                ),
            )

    def list_continuity_reports(self, story_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM continuity_reports WHERE story_id = ? ORDER BY created_at, report_id",
                (story_id,),
            ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["approved"] = bool(data["approved"])
                data["issues"] = json.loads(data["issues"])
                data["warnings"] = json.loads(data["warnings"])
                result.append(data)
            return result

    def create_event_projections(self, projections: list[dict[str, Any]]) -> None:
        with self._connect() as conn:
            for projection in projections:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO event_projections(projection_id, story_id, event_id, target_system,
                                                             projection_payload, status, created_at, applied_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        projection["projection_id"],
                        projection["story_id"],
                        projection["event_id"],
                        projection["target_system"],
                        json.dumps(projection.get("projection_payload", {}), ensure_ascii=False),
                        projection.get("status", "success"),
                        projection["created_at"],
                        projection.get("applied_at"),
                    ),
                )

    def list_event_projections(self, story_id: str, target_system: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if target_system:
                rows = conn.execute(
                    "SELECT * FROM event_projections WHERE story_id = ? AND target_system = ? ORDER BY created_at, projection_id",
                    (story_id, target_system),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM event_projections WHERE story_id = ? ORDER BY created_at, projection_id",
                    (story_id,),
                ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["projection_payload"] = json.loads(data["projection_payload"])
                result.append(data)
            return result


    def create_llm_run(self, run: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO llm_runs(llm_run_id, story_id, workspace_id, run_type, model_name, prompt_version,
                                                input_payload, output_payload, status, error_message, created_at, completed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run["llm_run_id"],
                    run["story_id"],
                    run.get("workspace_id"),
                    run["run_type"],
                    run.get("model_name", ""),
                    run["prompt_version"],
                    json.dumps(run.get("input_payload", {}), ensure_ascii=False),
                    json.dumps(run.get("output_payload", {}), ensure_ascii=False),
                    run.get("status", "success"),
                    run.get("error_message", ""),
                    run["created_at"],
                    run.get("completed_at"),
                ),
            )

    def list_llm_runs(self, story_id: str | None = None) -> list[dict[str, Any]]:
        with self._connect() as conn:
            if story_id:
                rows = conn.execute("SELECT * FROM llm_runs WHERE story_id = ? ORDER BY created_at, llm_run_id", (story_id,)).fetchall()
            else:
                rows = conn.execute("SELECT * FROM llm_runs ORDER BY created_at, llm_run_id").fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["input_payload"] = json.loads(data["input_payload"])
                data["output_payload"] = json.loads(data["output_payload"]) if data.get("output_payload") else {}
                result.append(data)
            return result

    def create_vector_chunks(self, chunks: list[dict[str, Any]]) -> None:
        with self._connect() as conn:
            for chunk in chunks:
                conn.execute(
                    """
                    INSERT OR REPLACE INTO vector_chunks(chunk_id, story_id, version_id, arc_id, chapter_id, scene_id,
                                                         source_file, chunk_type, entity_ids, qdrant_collection, text_preview, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk["chunk_id"],
                        chunk["story_id"],
                        chunk.get("version_id"),
                        chunk.get("arc_id"),
                        chunk.get("chapter_id"),
                        chunk.get("scene_id"),
                        chunk["source_file"],
                        chunk["chunk_type"],
                        json.dumps(chunk.get("entity_ids", []), ensure_ascii=False),
                        chunk["qdrant_collection"],
                        chunk.get("text_preview", ""),
                        chunk["created_at"],
                    ),
                )

    def list_vector_chunks(self, story_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM vector_chunks WHERE story_id = ? ORDER BY created_at, chunk_id",
                (story_id,),
            ).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                data["entity_ids"] = json.loads(data["entity_ids"])
                result.append(data)
            return result

