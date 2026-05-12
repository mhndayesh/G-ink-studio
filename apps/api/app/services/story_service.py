from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError
from app.core.ids import story_id_from_number, version_id_from_number
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.content_inspector import (
    chapter_has_content,
    has_content,
    meaningful_chapters,
    meaningful_page_count,
    meaningful_scenes,
    page_has_content,
    plot_threads_have_content,
    scene_has_content,
    script_has_meaningful_pages,
)


class StoryService:
    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService):
        self.registry = registry
        self.snapshot_service = snapshot_service

    def create_story(self, *, title: str, user_id: str) -> dict[str, Any]:
        self.registry.ensure_user(user_id=user_id)
        
        # Check if story already exists to avoid duplicates
        existing = self.registry.get_story_by_title(user_id, title)
        if existing:
            return {
                "story_id": existing["story_id"],
                "current_version_id": existing["current_version_id"],
                "state_type": existing["state_type"],
                "owner_user_id": user_id,
                "created_files": [],
                "snapshot_folder_path": "",
            }
            
        number = self.registry.next_story_number()
        story_id = story_id_from_number(number)
        version_id = version_id_from_number(1)
        now = datetime.now(timezone.utc).isoformat()

        created_paths, records = self.snapshot_service.create_v001_bundle(story_id=story_id, version_id=version_id, title=title)
        self.registry.create_story(story_id=story_id, user_id=user_id, title=title, version_id=version_id, now=now)
        self.registry.create_version(story_id=story_id, version_id=version_id, version_number=1, snapshot_folder_path=created_paths["master_story"].rsplit("/", 1)[0], now=now)
        self.registry.create_file_records(records, now=now)

        return {
            "story_id": story_id,
            "current_version_id": version_id,
            "state_type": "template_state",
            "owner_user_id": user_id,
            "created_files": [
                "master_story.json",
                "characters.json",
                "plot_outline.json",
                "memory_system.json",
                "plot_workspace.json",
                "chapter_script.json",
                "version_manifest.json",
            ],
            "snapshot_folder_path": created_paths["master_story"].rsplit("/", 1)[0],
        }

    def _compute_phase_status(self, story_id: str) -> dict[str, str]:
        result = {
            "master_story": "incomplete",
            "characters": "incomplete",
            "relationship_map": "locked",
            "plot_outline": "not_started",
            "plot_workspace": "not_started",
            "chapter_script": "draft",
        }
        master = self.registry.get_current_file(story_id, "master_story")
        characters = self.registry.get_current_file(story_id, "characters")
        plot = self.registry.get_current_file(story_id, "plot_outline")
        workspace = self.registry.get_current_file(story_id, "plot_workspace")
        script = self.registry.get_current_file(story_id, "chapter_script")

        if master:
            result["master_story"] = "in_progress"
            data = master["json_copy"]
            title = data.get("title", "")
            idea = data.get("idea_so_far", "")
            story_types = data.get("story_type", {}).get("selected", [])
            if title and idea and len(story_types) >= 1:
                result["master_story"] = "completed"
            world = data.get("world_type", {})
            world_sel = world.get("selected", "") if isinstance(world, dict) else ""
            if world_sel:
                result["world_core"] = "completed"
            else:
                result["world_core"] = "in_progress"
        else:
            result["world_core"] = "locked"

        if characters:
            result["characters"] = "in_progress"
            data = characters["json_copy"]
            major_count = len(data.get("created_major_character_profiles", []))
            side_count = len(data.get("created_side_character_profiles", []))
            if major_count >= 1:
                result["characters"] = "completed"
            rel_map = data.get("character_relationship_map", {})
            if rel_map.get("is_enabled") is True:
                result["relationship_map"] = "completed"
            elif major_count >= 2:
                result["relationship_map"] = "available"
            else:
                result["relationship_map"] = "locked"
        else:
            result["relationship_map"] = "locked"

        chapter_count = 0
        scene_count = 0
        integrity_locked = False
        if plot:
            result["plot_outline"] = "in_progress"
            data = plot["json_copy"]
            narrative = data.get("narrative_structure", {}).get("selected", "")
            chapters = data.get("chapter_or_episode_list", {}).get("chapters", []) or []
            scenes = data.get("scene_cards", {}).get("scenes", []) or []
            chapter_count = len(meaningful_chapters(chapters))
            scene_count = len(meaningful_scenes(scenes))
            if narrative and chapter_count >= 1:
                result["plot_outline"] = "completed"
            if scene_count >= 1:
                result["scene_cards"] = "completed"
            else:
                result["scene_cards"] = "not_started"
            locs = data.get("locations", {}).get("locations", []) or []
            named_locs = [l for l in locs if isinstance(l, dict) and l.get("name")]
            if named_locs:
                result["locations"] = "completed"
            else:
                result["locations"] = "not_started"
            # Propagate integrity lock into phase_status so the frontend can gate pages.
            lock = data.get("story_integrity_lock", {})
            integrity_locked = bool(lock.get("locked"))
            result["integrity_locked"] = "locked" if integrity_locked else "ok"
        else:
            result["scene_cards"] = "locked"
            result["locations"] = "locked"
            result["integrity_locked"] = "ok"

        if workspace:
            result["plot_workspace"] = "in_progress"
            data = workspace["json_copy"]
            free_text = data.get("user_free_writing", {}).get("text", "")
            ai_done = data.get("ai_completion", {}).get("is_enabled", False)
            ws_status = data.get("workspace_status", {}).get("status", "")
            analyzed = ws_status in {"confirmation_ready", "approved", "questions_pending", "analysis_ready"}
            if free_text and ai_done and analyzed:
                result["plot_workspace"] = "completed"
        else:
            result["plot_workspace"] = "not_started"

        # ── chapter_script lifecycle phases ──────────────────────────────────
        # locked            - plot/threads/lock prerequisites not met
        # ready             - prerequisites met, ready to generate (UI unlocks panel)
        # generated         - pages exist, not yet approved
        # approved          - user approved, events not yet extracted
        # events_extracted  - events detected, awaiting memory update / next version
        # completed         - next version bundle created (terminal phase)
        unlock_blockers: list[str] = []
        if not plot:
            unlock_blockers.append("plot_outline_missing")
        if integrity_locked:
            unlock_blockers.append("story_integrity_locked")
        if chapter_count < 1:
            unlock_blockers.append("no_chapters")

        script_data = (script or {}).get("json_copy", {}) if script else {}
        has_real_pages = script_has_meaningful_pages(script_data)
        approved = bool(script_data.get("approval", {}).get("script_approved_by_user", False))
        events_status = script_data.get("chapter_event_extraction", {}).get("status", "")
        next_version_id = script_data.get("memory_update_plan_after_chapter", {}).get("next_version_id", "")

        if next_version_id:
            result["chapter_script"] = "completed"
        elif approved and events_status == "completed":
            result["chapter_script"] = "events_extracted"
        elif approved:
            result["chapter_script"] = "approved"
        elif has_real_pages:
            result["chapter_script"] = "generated"
        elif unlock_blockers:
            result["chapter_script"] = "locked"
        else:
            result["chapter_script"] = "ready"
        result["chapter_script_unlock_blockers"] = ",".join(unlock_blockers)

        return result

    # (content predicates moved to app/services/content_inspector.py)

    def list_stories(self, *, user_id: str) -> list[dict[str, Any]]:
        stories = self.registry.list_stories_for_user(user_id)
        result = []
        for story in stories:
            files = self.registry.get_current_files(story["story_id"])
            file_types = {row["file_type"]: row["official_filename"] for row in files} if files else {}
            phase_status = self._compute_phase_status(story["story_id"])
            result.append({
                "story_id": story["story_id"],
                "title": story["title"],
                "current_version_id": story["current_version_id"],
                "state_type": story["state_type"],
                "phase_status": phase_status,
                "file_types": file_types,
                "created_at": story["created_at"],
                "updated_at": story["updated_at"],
            })
        return result

    def delete_story(self, *, story_id: str) -> dict[str, Any]:
        import shutil
        from pathlib import Path

        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        story_dir = Path(self.snapshot_service.storage_root) / story_id
        files_removed = False
        if story_dir.exists() and story_dir.is_dir():
            try:
                shutil.rmtree(story_dir)
                files_removed = True
            except OSError:
                files_removed = False
        self.registry.delete_story(story_id)
        return {
            "deleted": True,
            "story_id": story_id,
            "title": story["title"],
            "files_removed": files_removed,
        }

    def get_status(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        phase_status = self._compute_phase_status(story_id)
        # Extract the full lock object from plot_outline for the frontend.
        plot_rec = self.registry.get_current_file(story_id, "plot_outline")
        integrity_lock = (plot_rec.get("json_copy", {}) or {}).get("story_integrity_lock", {}) if plot_rec else {}
        return {
            "story_id": story_id,
            "title": story["title"],
            "owner_user_id": story.get("user_id"),
            "current_version_id": story["current_version_id"],
            "state_type": story["state_type"],
            "phase_status": phase_status,
            "integrity_lock": integrity_lock,
            "continuity_status": "not_checked",
        }

    def get_current_files(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        files = self.registry.get_current_files(story_id)
        return {
            "story_id": story_id,
            "version_id": story["current_version_id"],
            "files": {row["file_type"]: row["official_filename"] for row in files},
            "paths": {row["file_type"]: row["storage_path"] for row in files},
        }

    def get_manifest(self, story_id: str, version_id: str) -> dict[str, Any]:
        files = self.registry.get_files_for_version(story_id, version_id)
        for row in files:
            if row["file_type"] == "version_manifest":
                return row["json_copy"]
        raise MangaMakerError("MANIFEST_NOT_FOUND", f"Manifest not found for {story_id}/{version_id}", status_code=404)
