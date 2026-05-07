from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService


class PlotOutlineService:
    """Template-phase editor for plot_outline.json.

    plot_outline.json is the official plot plan. It can be edited during
    template_state setup. Messy free writing belongs in plot_workspace.json,
    not here.
    """

    arc_overview_branches = {
        "arc_title",
        "arc_number",
        "arc_type",
        "arc_length_type.selected",
        "arc_summary",
        "starting_status_quo",
        "main_story_question",
        "central_emotional_question",
        "main_external_conflict",
        "main_internal_conflict",
        "main_relationship_conflict",
        "main_threat_used",
        "minor_threats_used",
        "main_factions_used",
        "main_characters_used",
        "relationships_used",
        "ending_type_target",
        "custom_arc_overview_details",
    }

    _allowed_prefixes = {
        "story_arc_overview",
        "kishotenketsu_outline",
        "conflict_driven_outline",
        "plot_threads",
    }

    _ki_fields = {"initial_mystery_or_question", "opening_image", "chapter_range"}
    _sho_fields = {"tension_growth", "chapter_range"}
    _ten_fields = {"main_twist", "hidden_truth_revealed", "major_threat_recontextualized", "relationship_reversal", "character_arc_turning_point", "chapter_range"}
    _ketsu_fields = {"conflict_resolution", "emotional_resolution", "relationship_resolution", "world_state_after_arc", "character_final_state", "chapter_range"}
    _act1_fields = {"opening_hook", "normal_world", "inciting_incident", "first_major_choice", "main_goal_locked", "chapter_range"}
    _act2_fields = {"midpoint_reveal_or_defeat", "stakes_increase", "chapter_range"}
    _act3_fields = {"darkest_moment", "final_plan_or_breakthrough", "climax_battle_or_confrontation", "major_threat_outcome", "character_arc_payoff", "relationship_payoff", "ending_image", "chapter_range"}
    _main_thread_fields = {"goal", "obstacles", "turning_points", "resolution"}
    _char_arc_fields = {"character_id", "starting_state", "growth_beats", "lowest_point", "final_state"}
    _rel_fields = {"relationship_id", "start_dynamic", "change_beats", "breaking_point", "final_dynamic"}
    _threat_thread_fields = {"threat_id_or_name", "first_hint", "escalation_beats", "reveal", "final_outcome"}
    _power_fields = {"character_id", "power_name", "first_use", "training_or_failure_beats", "breakthrough", "cost_or_consequence"}

    list_arc_branches = {
        "minor_threats_used",
        "main_factions_used",
        "main_characters_used",
        "relationships_used",
    }

    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService, validator: ValidationService):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator

    def get_plot_outline(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "plot_outline",
            "state_type": data.get("state_type", "template_state"),
            "content": data,
        }

    def validate_plot_outline(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        self.validator.validate_story_file(file_type="plot_outline", data=data, story_id=story_id, version_id=record["version_id"])
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "plot_outline",
            "validation_status": "passed",
            "checks": [
                "story_id matches registry",
                "version_id matches current version",
                "file_type is plot_outline",
                "state_type is template_state",
                "master_story_file points to master_story.json",
                "characters_file points to characters.json",
                "writing_workspace_link points to plot_workspace.json and chapter_script.json",
                "story_start_workflow exists",
                "narrative_structure exists",
                "chapter_or_episode_list exists",
                "scene_cards exists",
            ],
        }

    def update_story_start_workflow(self, *, story_id: str, start_mode: str | None = None, current_stage: str | None = None) -> dict[str, Any]:
        record, data = self._editable(story_id)
        workflow = data.get("story_start_workflow", {})
        if start_mode is not None:
            options = workflow.get("start_mode", {}).get("options", [])
            if start_mode not in options:
                raise MangaMakerError("INVALID_OPTION", f"{start_mode!r} is not a valid story start mode", details={"options": options})
            workflow.setdefault("start_mode", {})["selected"] = start_mode
        if current_stage is not None:
            workflow["current_stage"] = current_stage
        data["story_start_workflow"] = workflow
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "start_mode": workflow.get("start_mode", {}).get("selected", ""),
            "current_stage": workflow.get("current_stage", ""),
            "validation_status": "passed",
        }

    def update_narrative_structure(self, *, story_id: str, selected: str, custom_structure: str = "") -> dict[str, Any]:
        record, data = self._editable(story_id)
        structure = data.get("narrative_structure", {})
        options = structure.get("options", [])
        if selected not in options:
            raise MangaMakerError("INVALID_OPTION", f"{selected!r} is not a valid narrative structure", details={"options": options})
        structure["selected"] = selected
        structure["custom_structure"] = custom_structure
        data["narrative_structure"] = structure

        enabled_sections = self._enabled_sections_for_structure(selected)
        data.setdefault("kishotenketsu_outline", {})["is_enabled"] = "kishotenketsu_outline" in enabled_sections
        data.setdefault("conflict_driven_outline", {})["is_enabled"] = "conflict_driven_outline" in enabled_sections

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "selected": selected,
            "custom_structure": custom_structure,
            "enabled_sections": enabled_sections,
            "validation_status": "passed",
        }

    def redo_arc_structure(
        self,
        *,
        story_id: str,
        selected: str,
        custom_structure: str = "",
        preserve_arc_overview: bool = True,
        clear_chapter_script: bool = True,
        confirmation: str,
    ) -> dict[str, Any]:
        if confirmation != "RESET ARC":
            raise MangaMakerError(
                "CONFIRMATION_REQUIRED",
                'Type "RESET ARC" to redo the arc structure and clear generated chapter work.',
                status_code=400,
            )

        record, data = self._editable(story_id)
        structure = data.get("narrative_structure", {})
        options = structure.get("options", [])
        if selected not in options:
            raise MangaMakerError("INVALID_OPTION", f"{selected!r} is not a valid narrative structure", details={"options": options})

        old_chapter_count = len(data.get("chapter_or_episode_list", {}).get("chapters", []) or [])
        old_scene_count = len(data.get("scene_cards", {}).get("scenes", []) or [])
        preserved_overview = deepcopy(data.get("story_arc_overview", {}))

        structure["selected"] = selected
        structure["custom_structure"] = custom_structure
        data["narrative_structure"] = structure
        self._remove_legacy_arc_overview_root_fields(data)
        if preserve_arc_overview:
            data["story_arc_overview"] = preserved_overview
        else:
            self._clear_arc_overview(data)

        enabled_sections = self._enabled_sections_for_structure(selected)
        self._reset_structure_editors(data, enabled_sections)
        data.setdefault("chapter_or_episode_list", {})["chapters"] = []
        data.setdefault("scene_cards", {})["scenes"] = []
        data["story_integrity_lock"] = deepcopy(self._LOCK_DEFAULTS)

        self._save(story_id=story_id, record=record, data=data)

        script_cleared = False
        if clear_chapter_script:
            script_cleared = self._reset_chapter_script(story_id=story_id)

        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "selected": selected,
            "custom_structure": custom_structure,
            "enabled_sections": enabled_sections,
            "preserved_arc_overview": preserve_arc_overview,
            "cleared_chapters": old_chapter_count,
            "cleared_scenes": old_scene_count,
            "cleared_chapter_script": script_cleared,
            "integrity_lock": data["story_integrity_lock"],
            "validation_status": "passed",
        }

    def patch_arc_overview(self, *, story_id: str, target_branch: str, operation: str, value: Any = None) -> dict[str, Any]:
        record, data = self._editable(story_id)
        if not self._branch_allowed(target_branch):
            raise MangaMakerError("BRANCH_NOT_ALLOWED", f"{target_branch} cannot be edited here", details={"allowed_prefixes": sorted(self._allowed_prefixes)})
        if operation == "replace" and target_branch.endswith("arc_length_type.selected"):
            value = self._selected_option_value(value)
        apply_branch = f"story_arc_overview.{target_branch}" if target_branch in self.arc_overview_branches else target_branch
        used_value = self._apply_patch(data, apply_branch, operation, value)
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "target_branch": target_branch,
            "operation": operation,
            "updated_value": used_value,
            "validation_status": "passed",
        }

    def _branch_allowed(self, target_branch: str) -> bool:
        import re
        if target_branch in self.arc_overview_branches:
            return True
        tokens = self._tokens(target_branch)
        if not tokens:
            return False
        prefix = tokens[0]
        if prefix not in self._allowed_prefixes:
            return False
        if prefix == "story_arc_overview":
            return True
        if prefix == "kishotenketsu_outline":
            return self._match_structure(tokens[1:], "ki_introduction", self._ki_fields) \
                or self._match_structure(tokens[1:], "sho_development", self._sho_fields) \
                or self._match_structure(tokens[1:], "ten_twist_or_turn", self._ten_fields) \
                or self._match_structure(tokens[1:], "ketsu_conclusion", self._ketsu_fields)
        if prefix == "conflict_driven_outline":
            return self._match_structure(tokens[1:], "act_1_setup", self._act1_fields) \
                or self._match_structure(tokens[1:], "act_2_escalation", self._act2_fields) \
                or self._match_structure(tokens[1:], "act_3_climax_resolution", self._act3_fields)
        if prefix == "plot_threads":
            if len(tokens) == 1:
                return True
            sub_prefix = tokens[1] if len(tokens) > 1 else ""
            if sub_prefix == "main_plot_thread":
                return len(tokens) == 3 and tokens[2] in self._main_thread_fields
            if sub_prefix == "character_arc_threads":
                return len(tokens) == 2 or (len(tokens) == 4 and isinstance(tokens[2], int) and tokens[3] in self._char_arc_fields)
            if sub_prefix == "relationship_threads":
                return len(tokens) == 2 or (len(tokens) == 4 and isinstance(tokens[2], int) and tokens[3] in self._rel_fields)
            if sub_prefix == "threat_threads":
                return len(tokens) == 2 or (len(tokens) == 4 and isinstance(tokens[2], int) and tokens[3] in self._threat_thread_fields)
            if sub_prefix == "power_threads":
                return len(tokens) == 2 or (len(tokens) == 4 and isinstance(tokens[2], int) and tokens[3] in self._power_fields)
        return False

    def _match_structure(self, tokens: list[str | int], section: str, fields: set[str]) -> bool:
        return len(tokens) == 2 and tokens[0] == section and tokens[1] in fields

    def _merge_chapter_data(self, chapter: dict[str, Any], chapter_id: str, chapter_number: int) -> dict[str, Any]:
        return {
            "chapter_id": chapter_id,
            "chapter_number": chapter_number,
            "arc_title": chapter.get("arc_title", ""),
            "chapter_title": chapter.get("chapter_title", ""),
            "chapter_purpose": chapter.get("chapter_purpose", ""),
            "structure_section": chapter.get("structure_section", ""),
            "summary": chapter.get("summary", ""),
            "characters_present": chapter.get("characters_present", []),
            "relationships_used": chapter.get("relationships_used", []),
            "factions_used": chapter.get("factions_used", []),
            "threats_used": chapter.get("threats_used", []),
            "world_rules_shown": chapter.get("world_rules_shown", []),
            "power_system_shown": chapter.get("power_system_shown", []),
            "main_conflict": chapter.get("main_conflict", ""),
            "emotional_beat": chapter.get("emotional_beat", ""),
            "twist_or_hook": chapter.get("twist_or_hook", ""),
            "ending_cliffhanger": chapter.get("ending_cliffhanger", ""),
            "custom_chapter_details": chapter.get("custom_chapter_details", ""),
        }

    def _merge_scene_data(self, scene: dict[str, Any], scene_id: str, chapter_id: str, scene_block: list) -> dict[str, Any]:
        return {
            "scene_id": scene_id,
            "chapter_id": chapter_id,
            "scene_order": scene.get("scene_order") or len([s for s in scene_block if s.get("chapter_id") == chapter_id]) + 1,
            "location": scene.get("location", ""),
            "time": scene.get("time", ""),
            "characters_present": scene.get("characters_present", []),
            "scene_goal": scene.get("scene_goal", ""),
            "scene_conflict": scene.get("scene_conflict", ""),
            "relationship_dynamic_used": scene.get("relationship_dynamic_used", ""),
            "new_information_revealed": scene.get("new_information_revealed", ""),
            "action_or_dialogue_focus": scene.get("action_or_dialogue_focus", ""),
            "visual_manga_moment": scene.get("visual_manga_moment", ""),
            "panel_mood": scene.get("panel_mood", ""),
            "ending_beat": scene.get("ending_beat", ""),
            "custom_scene_details": scene.get("custom_scene_details", ""),
        }

    # ── integrity lock helpers ────────────────────────────────────────────────

    _LOCK_DEFAULTS: dict[str, Any] = {
        "locked": False,
        "lock_reason": None,
        "locked_at": None,
        "deleted_chapter_id": None,
        "deleted_chapter_number": None,
        "deleted_chapter_title": None,
        "chapters_to_restore": [],
        "chapters_restored": [],
    }

    def _get_lock(self, data: dict) -> dict:
        lock = data.setdefault("story_integrity_lock", deepcopy(self._LOCK_DEFAULTS))
        for k, v in self._LOCK_DEFAULTS.items():
            lock.setdefault(k, deepcopy(v) if isinstance(v, list) else v)
        return lock

    def _set_chapter_lock(self, data: dict, deleted_ch: dict, remaining_after: list[dict]) -> dict:
        deleted_num = deleted_ch.get("chapter_number", 0)
        nums_after = sorted(
            c.get("chapter_number", 0) for c in remaining_after
            if c.get("chapter_number", 0) > deleted_num
        )
        lock = self._get_lock(data)
        lock.update({
            "locked": True,
            "lock_reason": "chapter_deleted",
            "locked_at": datetime.now(timezone.utc).isoformat(),
            "deleted_chapter_id": deleted_ch.get("chapter_id"),
            "deleted_chapter_number": deleted_num,
            "deleted_chapter_title": deleted_ch.get("chapter_title", ""),
            "chapters_to_restore": [deleted_num] + list(nums_after),
            "chapters_restored": [],
        })
        return lock

    def _advance_lock(self, data: dict, chapter_number: int) -> bool:
        """Check if chapter_number matches the first pending restore step; if so advance.
        Returns True if lock state changed."""
        lock = data.get("story_integrity_lock", {})
        if not lock.get("locked"):
            return False
        to_restore: list = lock.get("chapters_to_restore", [])
        if not to_restore or chapter_number != to_restore[0]:
            return False
        lock.setdefault("chapters_restored", []).append(to_restore.pop(0))
        if not to_restore:
            lock["locked"] = False
            lock["lock_reason"] = None
        return True

    def advance_integrity_lock(self, *, story_id: str, chapter_number: int) -> dict[str, Any]:
        """Manually advance the lock past the given chapter number (for existing chapters user has reviewed)."""
        record, data = self._editable(story_id)
        lock = self._get_lock(data)
        if not lock.get("locked"):
            return {"story_id": story_id, "already_unlocked": True, "integrity_lock": lock}
        changed = self._advance_lock(data, chapter_number)
        if not changed:
            to_restore = lock.get("chapters_to_restore", [])
            raise MangaMakerError(
                "LOCK_ADVANCE_ERROR",
                f"Chapter {chapter_number} is not the next required step. Next: {to_restore[0] if to_restore else 'none'}",
                status_code=400,
            )
        self._save(story_id=story_id, record=record, data=data)
        return {"story_id": story_id, "advanced": True, "integrity_lock": data["story_integrity_lock"]}

    # ── chapter CRUD ──────────────────────────────────────────────────────────

    def create_chapter(self, *, story_id: str, chapter: dict[str, Any]) -> dict[str, Any]:
        record, data = self._editable(story_id)
        if not self._arc_length_selected(data):
            raise MangaMakerError(
                "ARC_LENGTH_REQUIRED",
                "Please choose arc length before creating chapters.",
                status_code=400,
            )
        chapters_block = data.setdefault("chapter_or_episode_list", {}).setdefault("chapters", [])
        existing_index = None
        chapter_id = chapter.get("chapter_id")
        if chapter_id:
            existing_index = self._find_index(chapters_block, "chapter_id", chapter_id)
        if existing_index is None:
            chapter_id = chapter_id or f"ch_{len(chapters_block) + 1:03d}"
            chapter_number = chapter.get("chapter_number") or len(chapters_block) + 1
            self._ensure_unique(chapters_block, "chapter_number", chapter_number, "CHAPTER_NUMBER_EXISTS")
        else:
            existing = chapters_block[existing_index]
            chapter_number = chapter.get("chapter_number") or existing.get("chapter_number", len(chapters_block) + 1)
        new_chapter = self._merge_chapter_data(chapter, chapter_id, chapter_number)
        if existing_index is None:
            chapters_block.append(new_chapter)
            replaced_placeholder = False
        else:
            chapters_block[existing_index] = new_chapter
            replaced_placeholder = True
        # Auto-advance integrity lock when the created chapter matches the next required step.
        self._advance_lock(data, chapter_number)
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "chapter": new_chapter,
            "chapter_count": len(chapters_block),
            "replaced_placeholder": replaced_placeholder,
            "integrity_lock": data.get("story_integrity_lock"),
            "validation_status": "passed",
        }

    def create_scene(self, *, story_id: str, scene: dict[str, Any]) -> dict[str, Any]:
        record, data = self._editable(story_id)
        scene_block = data.setdefault("scene_cards", {}).setdefault("scenes", [])
        chapter_id = scene.get("chapter_id", "")
        if not chapter_id:
            raise MangaMakerError("VALIDATION_ERROR", "chapter_id is required for scene cards")
        existing_chapters = data.get("chapter_or_episode_list", {}).get("chapters", [])
        if existing_chapters and chapter_id not in {ch.get("chapter_id") for ch in existing_chapters}:
            raise MangaMakerError("CHAPTER_NOT_FOUND", f"chapter_id {chapter_id!r} does not exist in chapter_or_episode_list")
        if not self._is_meaningful_scene(scene):
            raise MangaMakerError(
                "SCENE_CONTENT_REQUIRED",
                "Scene cards need at least a goal, conflict, visual moment, location, or ending beat.",
                status_code=400,
            )
        existing_index = None
        scene_id = scene.get("scene_id")
        if scene_id:
            existing_index = self._find_index(scene_block, "scene_id", scene_id)
        if existing_index is None:
            scene_id = scene_id or f"scene_{len(scene_block) + 1:03d}"
            if not scene.get("scene_order"):
                scene["scene_order"] = len([s for s in scene_block if s.get("chapter_id") == chapter_id]) + 1
        new_scene = self._merge_scene_data(scene, scene_id, chapter_id, scene_block)
        if existing_index is None:
            scene_block.append(new_scene)
            replaced_placeholder = False
        else:
            scene_block[existing_index] = new_scene
            replaced_placeholder = True
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "scene": new_scene,
            "scene_count": len(scene_block),
            "replaced_placeholder": replaced_placeholder,
            "validation_status": "passed",
        }

    def delete_chapter(self, *, story_id: str, chapter_id: str) -> dict[str, Any]:
        record, data = self._editable(story_id)
        chapters_block = data.setdefault("chapter_or_episode_list", {}).get("chapters", [])
        index = self._find_index(chapters_block, "chapter_id", chapter_id)
        if index is None:
            raise MangaMakerError("CHAPTER_NOT_FOUND", f"Chapter {chapter_id!r} not found", status_code=404)

        deleted_ch = chapters_block[index]
        deleted_num = deleted_ch.get("chapter_number", 0)
        remaining_after = [c for c in chapters_block if c.get("chapter_number", 0) > deleted_num]

        chapters_block.pop(index)

        # Clean up orphaned scene_cards for the deleted chapter.
        scenes_block = data.setdefault("scene_cards", {}).setdefault("scenes", [])
        original_scene_count = len(scenes_block)
        scenes_block[:] = [s for s in scenes_block if s.get("chapter_id") != chapter_id]
        removed_scenes = original_scene_count - len(scenes_block)

        # Set integrity lock when chapters come after the deleted one.
        # If it was the last chapter, just clear any pre-existing lock.
        if remaining_after:
            self._set_chapter_lock(data, deleted_ch, remaining_after)
        else:
            lock = data.get("story_integrity_lock", {})
            if lock.get("locked"):
                lock["locked"] = False
                lock["lock_reason"] = None

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "chapter_id": chapter_id,
            "chapter_count": len(chapters_block),
            "removed_scenes": removed_scenes,
            "integrity_lock": data.get("story_integrity_lock"),
            "validation_status": "passed",
        }

    def delete_scene(self, *, story_id: str, scene_id: str) -> dict[str, Any]:
        record, data = self._editable(story_id)
        scenes_block = data.setdefault("scene_cards", {}).get("scenes", [])
        index = self._find_index(scenes_block, "scene_id", scene_id)
        if index is None:
            raise MangaMakerError("SCENE_NOT_FOUND", f"Scene {scene_id!r} not found", status_code=404)
        scenes_block.pop(index)
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "scene_id": scene_id,
            "scene_count": len(scenes_block),
            "validation_status": "passed",
        }

    def _clear_arc_overview(self, data: dict[str, Any]) -> None:
        overview = data.setdefault("story_arc_overview", {})
        for key, value in list(overview.items()):
            if key == "arc_number":
                overview[key] = 1
            elif isinstance(value, list):
                overview[key] = []
            elif isinstance(value, dict):
                if "selected" in value:
                    value["selected"] = ""
                else:
                    overview[key] = {}
            else:
                overview[key] = ""

    def _remove_legacy_arc_overview_root_fields(self, data: dict[str, Any]) -> None:
        for key in self.arc_overview_branches:
            root_key = key.split(".", 1)[0]
            data.pop(root_key, None)

    def _reset_structure_editors(self, data: dict[str, Any], enabled_sections: list[str]) -> None:
        data.setdefault("kishotenketsu_outline", {})["is_enabled"] = "kishotenketsu_outline" in enabled_sections
        data.setdefault("conflict_driven_outline", {})["is_enabled"] = "conflict_driven_outline" in enabled_sections
        for block_name in ("kishotenketsu_outline", "conflict_driven_outline"):
            block = data.get(block_name, {})
            self._clear_structure_values(block)

    def _clear_structure_values(self, value: Any) -> None:
        if isinstance(value, dict):
            for key, child in value.items():
                if key in {"is_enabled", "note_to_user", "purpose"}:
                    continue
                if isinstance(child, dict):
                    self._clear_structure_values(child)
                elif isinstance(child, list):
                    value[key] = []
                elif isinstance(child, str):
                    value[key] = ""
                elif child is not None:
                    value[key] = None

    def _reset_chapter_script(self, *, story_id: str) -> bool:
        record = self.registry.get_current_file(story_id, "chapter_script")
        if not record:
            return False
        data = deepcopy(record["json_copy"])
        data["script_id"] = "script_ch_001"
        data["chapter_metadata"] = {
            "arc_id": "arc_001",
            "chapter_id": "ch_001",
            "chapter_number": 1,
            "chapter_title": "",
            "chapter_status": "draft",
            "created_from_workspace_id": "workspace_001",
            "created_from_plot_outline_chapter_id": "ch_001",
            "script_version": "draft_001",
            "approved_as_official": False,
        }
        data["chapter_purpose"] = {
            "summary": "",
            "chapter_goal": "",
            "reader_question": "",
            "opening_hook": "",
            "ending_hook": "",
            "main_emotional_beat": "",
            "main_conflict": "",
            "main_relationship_dynamic": "",
            "main_world_rule_shown": "",
            "main_power_or_ability_shown": "",
            "threat_hint_or_reveal": "",
            "custom_chapter_purpose_details": "",
        }
        data["linked_story_context"] = {
            "characters_present": [],
            "relationships_used": [],
            "factions_used": [],
            "locations_used": [],
            "world_rules_used": [],
            "powers_used": [],
            "major_threats_used": [],
            "minor_threats_used": [],
            "plot_threads_used": [],
            "foreshadowing_used": [],
        }
        data["chapter_scene_breakdown"] = []
        data["pages"] = []
        data["chapter_dialogue_index"] = []
        data["chapter_visual_index"] = {
            "important_visual_moments": [],
            "new_character_design_notes": [],
            "new_location_design_notes": [],
            "power_visuals_used": [],
            "symbolism_or_motifs_used": [],
        }
        data["chapter_event_extraction"] = {
            "status": "not_started",
            "detected_events_from_script": [],
            "events_confirmed_by_user": [],
            "events_rejected_by_user": [],
            "events_to_save_after_approval": [],
        }
        data["continuity_checks"] = {
            "status": "not_started",
            "checks": data.get("continuity_checks", {}).get("checks", []),
            "issues_found": [],
            "fix_notes": "",
        }
        data["approval"] = {
            "script_approved_by_user": False,
            "approved_at": "",
            "approval_notes": "",
            "ready_for_memory_update": False,
        }
        data["custom_chapter_script_details"] = ""
        self.validator.validate_story_file(file_type="chapter_script", data=data, story_id=story_id, version_id=record["version_id"])
        checksum = self.snapshot_service.write_existing_json(path=record["storage_path"], data=data)
        now = datetime.now(timezone.utc).isoformat()
        self.registry.update_file_json_copy(
            story_id=story_id,
            version_id=record["version_id"],
            file_type="chapter_script",
            json_copy=data,
            checksum=checksum,
            now=now,
        )
        return True

    def _get_record(self, story_id: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, "plot_outline")
        if not record:
            raise MangaMakerError("PLOT_OUTLINE_NOT_FOUND", f"plot_outline.json not found for {story_id}", status_code=404)
        return record

    def _editable(self, story_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        if data.get("state_type") != "template_state":
            raise MangaMakerError("EVENT_REQUIRED", "plot_outline.json is no longer template_state. Use event/patch/version flow for official changes.")
        return record, data

    def _save(self, *, story_id: str, record: dict[str, Any], data: dict[str, Any]) -> None:
        self.validator.validate_story_file(file_type="plot_outline", data=data, story_id=story_id, version_id=record["version_id"])
        checksum = self.snapshot_service.write_existing_json(path=record["storage_path"], data=data)
        now = datetime.now(timezone.utc).isoformat()
        self.registry.update_file_json_copy(
            story_id=story_id,
            version_id=record["version_id"],
            file_type="plot_outline",
            json_copy=data,
            checksum=checksum,
            now=now,
        )

    def _enabled_sections_for_structure(self, selected: str) -> list[str]:
        if selected == "Kishotenketsu":
            return ["kishotenketsu_outline"]
        if selected == "Hybrid":
            return ["kishotenketsu_outline", "conflict_driven_outline"]
        return ["conflict_driven_outline"]

    def _apply_patch(self, branch_root: dict[str, Any], target_branch: str, operation: str, value: Any) -> Any:
        tokens = self._tokens(target_branch)
        if not tokens:
            raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {target_branch}")
        parent: Any = branch_root
        for i in range(len(tokens) - 1):
            token = tokens[i]
            if isinstance(token, int):
                if not isinstance(parent, list):
                    raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {target_branch}")
                while len(parent) <= token:
                    parent.append({})
                parent = parent[token]
            else:
                if token not in parent:
                    parent[token] = {}
                elif not isinstance(parent[token], (dict, list)):
                    raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {target_branch}")
                parent = parent[token]
        key = tokens[-1]
        if isinstance(key, int):
            raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch cannot end with array index: {target_branch}")

        if operation == "replace":
            parent[key] = value
        elif operation == "merge_object":
            if key not in parent:
                parent[key] = {}
            parent[key] = self._deep_merge(parent[key], value)
        elif operation == "append_to_array":
            if key not in parent:
                parent[key] = []
            if not isinstance(parent[key], list):
                raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch is not an array: {target_branch}")
            if isinstance(value, list):
                parent[key].extend(value)
            else:
                parent[key].append(value)
        elif operation == "remove_index":
            if isinstance(parent.get(key), list):
                target_idx = value.get("index") if isinstance(value, dict) else value
                if isinstance(target_idx, int) and 0 <= target_idx < len(parent[key]):
                    parent[key].pop(target_idx)
                else:
                    raise MangaMakerError("INVALID_INDEX", f"Invalid index for remove_index: {target_idx}")
            else:
                raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch is not an array: {target_branch}")
        elif operation == "remove":
            if key not in parent:
                raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {target_branch}")
            parent[key] = [] if isinstance(parent[key], list) else ""
        else:
            raise MangaMakerError("INVALID_OPERATION", f"Unsupported operation: {operation}")
        return parent.get(key)

    def _get_path(self, data: dict[str, Any], path: str) -> Any:
        current: Any = data
        for token in self._tokens(path):
            if isinstance(token, int):
                if not isinstance(current, list) or token >= len(current):
                    raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {path}")
                current = current[token]
            else:
                if not isinstance(current, dict) or token not in current:
                    raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {path}")
                current = current[token]
        return current

    def _tokens(self, branch: str) -> list[str | int]:
        parts: list[str | int] = []
        for raw in branch.replace("]", "").replace("[", ".").split("."):
            if raw == "":
                continue
            parts.append(int(raw) if raw.isdigit() else raw)
        return parts

    def _deep_merge(self, base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
        for key, value in updates.items():
            if isinstance(value, dict) and isinstance(base.get(key), dict):
                self._deep_merge(base[key], value)
            else:
                base[key] = value
        return base

    def _find_index(self, items: list[dict[str, Any]], key: str, value: Any) -> int | None:
        for index, item in enumerate(items):
            if item.get(key) == value:
                return index
        return None

    def _is_placeholder_chapter(self, chapter: dict[str, Any]) -> bool:
        return not any([
            chapter.get("chapter_title"),
            chapter.get("chapter_purpose"),
            chapter.get("summary"),
            chapter.get("main_conflict"),
            chapter.get("ending_cliffhanger"),
        ])

    def _arc_length_selected(self, data: dict[str, Any]) -> bool:
        overview = data.get("story_arc_overview", {})
        value = overview.get("arc_length_type", "")
        selected = self._selected_option_value(value)
        if not selected:
            legacy = data.get("arc_length_type", "")
            selected = self._selected_option_value(legacy)
        return bool(str(selected).strip())

    def _selected_option_value(self, value: Any) -> str:
        current = value
        for _ in range(4):
            if isinstance(current, dict):
                current = current.get("selected", "")
                continue
            if current is None:
                return ""
            return str(current).strip()
        return ""

    def _is_placeholder_scene(self, scene: dict[str, Any]) -> bool:
        return not any([
            scene.get("location"),
            scene.get("scene_goal"),
            scene.get("scene_conflict"),
            scene.get("visual_manga_moment"),
            scene.get("ending_beat"),
        ])

    def _is_meaningful_scene(self, scene: dict[str, Any]) -> bool:
        return any([
            scene.get("location"),
            scene.get("scene_goal"),
            scene.get("scene_conflict"),
            scene.get("new_information_revealed"),
            scene.get("action_or_dialogue_focus"),
            scene.get("visual_manga_moment"),
            scene.get("ending_beat"),
            scene.get("custom_scene_details"),
        ])

    def _ensure_unique(self, items: list[dict[str, Any]], key: str, value: Any, code: str) -> None:
        if any(item.get(key) == value for item in items):
            raise MangaMakerError(code, f"{key} {value!r} already exists")
