from __future__ import annotations

from typing import Any
from app.core.errors import MangaMakerError


class ValidationService:
    official_names = {
        "master_story": "master_story.json",
        "characters": "characters.json",
        "plot_outline": "plot_outline.json",
        "memory_system": "memory_system.json",
        "plot_workspace": "plot_workspace.json",
        "chapter_script": "chapter_script.json",
    }

    def validate_story_file(self, *, file_type: str, data: dict[str, Any], story_id: str, version_id: str) -> None:
        if data.get("story_id") != story_id:
            raise MangaMakerError("VALIDATION_ERROR", f"{file_type}: story_id must be {story_id}")
        if data.get("version_id") != version_id:
            raise MangaMakerError("VALIDATION_ERROR", f"{file_type}: version_id must be {version_id}")
        if data.get("file_type") != file_type:
            raise MangaMakerError("VALIDATION_ERROR", f"{file_type}: file_type mismatch")
        if data.get("state_type") != "template_state":
            raise MangaMakerError("VALIDATION_ERROR", f"{file_type}: state_type must start as template_state")

        if file_type == "master_story":
            self._validate_master_story(data)
        elif file_type == "characters":
            self._validate_characters(data)
        elif file_type == "plot_outline":
            self._validate_plot_outline(data)
        elif file_type == "memory_system":
            self._validate_memory_system(data)
        elif file_type == "plot_workspace":
            self._validate_plot_workspace(data)
        elif file_type == "chapter_script":
            self._validate_chapter_script(data)


    def _validate_master_story(self, data: dict[str, Any]) -> None:
        required = [
            "title",
            "idea_so_far",
            "story_type",
            "ending_direction",
            "story_foundation",
            "world_type",
            "world_master_rules",
            "major_factions_and_ruling_sides",
            "major_threats_and_minor_side_threats",
        ]
        for key in required:
            if key not in data:
                raise MangaMakerError("VALIDATION_ERROR", f"master_story missing required branch: {key}")
        for branch in ("story_type", "world_master_rules", "major_factions_and_ruling_sides"):
            block = data.get(branch)
            if not isinstance(block, dict):
                raise MangaMakerError("VALIDATION_ERROR", f"master_story.{branch} must be an object")
            selected = block.get("selected")
            if selected is None:
                block["selected"] = []
                continue
            if not isinstance(selected, list):
                raise MangaMakerError("VALIDATION_ERROR", f"master_story.{branch}.selected must be a list")

    def _validate_characters(self, data: dict[str, Any]) -> None:
        rel = data.get("character_relationship_map", {})
        created = data.get("created_major_character_profiles", [])
        if len(created) < 2:
            if rel.get("is_enabled") is not False:
                raise MangaMakerError("RELATIONSHIP_MAP_LOCKED", "Relationship map must start disabled until two real major profiles exist.")
            if rel.get("relationships") != []:
                raise MangaMakerError("RELATIONSHIP_MAP_LOCKED", "Relationship map relationships must start empty.")
        if data.get("master_story_file") != "master_story.json":
            raise MangaMakerError("FILENAME_ERROR", "characters.master_story_file must be master_story.json")

    def _validate_plot_outline(self, data: dict[str, Any]) -> None:
        if data.get("master_story_file") != "master_story.json":
            raise MangaMakerError("FILENAME_ERROR", "plot_outline.master_story_file must be master_story.json")
        if data.get("characters_file") != "characters.json":
            raise MangaMakerError("FILENAME_ERROR", "plot_outline.characters_file must be characters.json")
        link = data.get("writing_workspace_link", {})
        if link.get("current_workspace_file") != "plot_workspace.json":
            raise MangaMakerError("FILENAME_ERROR", "plot_outline writing_workspace_link must point to plot_workspace.json")
        if link.get("current_chapter_script_file") != "chapter_script.json":
            raise MangaMakerError("FILENAME_ERROR", "plot_outline writing_workspace_link must point to chapter_script.json")

    def _validate_memory_system(self, data: dict[str, Any]) -> None:
        names = data.get("versioning", {}).get("official_file_names", {})
        for key, filename in self.official_names.items():
            if names.get(key) != filename:
                raise MangaMakerError("FILENAME_ERROR", f"memory_system official_file_names.{key} must be {filename}")
        core_rule = data.get("memory_architecture", {}).get("core_rule", "")
        if "never directly overwrites" not in core_rule:
            raise MangaMakerError("VALIDATION_ERROR", "memory_system must preserve LLM never-overwrite rule")

    def _validate_plot_workspace(self, data: dict[str, Any]) -> None:
        linked = data.get("linked_files", {})
        expected = {
            "master_story_file": "master_story.json",
            "characters_file": "characters.json",
            "plot_outline_file": "plot_outline.json",
            "memory_system_file": "memory_system.json",
            "chapter_script_output_file": "chapter_script.json",
        }
        for key, value in expected.items():
            if linked.get(key) != value:
                raise MangaMakerError("FILENAME_ERROR", f"plot_workspace linked_files.{key} must be {value}")
        ai = data.get("ai_completion", {})
        if "is_enabled" not in ai:
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace.ai_completion.is_enabled is required")
        if not isinstance(ai.get("is_enabled"), bool):
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace.ai_completion.is_enabled must be boolean")
        mandatory = data.get("mandatory_analysis_after_writing", {})
        if mandatory.get("extract_consequences") is not True:
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace must always extract consequences")
        if mandatory.get("require_user_confirmation_before_save") is not True:
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace must require confirmation before save")

    def _validate_chapter_script(self, data: dict[str, Any]) -> None:
        linked = data.get("linked_files", {})
        expected = {
            "master_story_file": "master_story.json",
            "characters_file": "characters.json",
            "plot_outline_file": "plot_outline.json",
            "plot_workspace_file": "plot_workspace.json",
            "memory_system_file": "memory_system.json",
        }
        for key, value in expected.items():
            if linked.get(key) != value:
                raise MangaMakerError("FILENAME_ERROR", f"chapter_script linked_files.{key} must be {value}")
        if data.get("script_format", {}).get("format_type") != "manga_script":
            raise MangaMakerError("VALIDATION_ERROR", "chapter_script must use manga_script format")
        if not isinstance(data.get("pages"), list):
            raise MangaMakerError("VALIDATION_ERROR", "chapter_script must contain pages array")

    def validate_cross_references(self, files: dict[str, dict]) -> list[str]:
        """Check cross-file ID references. Returns warning strings (does not raise).

        Catches dangling IDs that accumulate when characters/locations/chapters are
        deleted after downstream files (chapter_script, plot_outline) already reference them.
        """
        warnings: list[str] = []
        char_data = files.get("characters") or {}
        plot_data = files.get("plot_outline") or {}
        script_data = files.get("chapter_script") or {}

        # Build reference sets
        major_profiles = char_data.get("created_major_character_profiles") or []
        side_profiles = char_data.get("created_side_character_profiles") or []
        profile_ids: set[str] = {p["profile_id"] for p in major_profiles + side_profiles if p.get("profile_id")}
        profile_names: set[str] = {
            (p.get("character_name") or "").strip().lower()
            for p in major_profiles + side_profiles
            if (p.get("character_name") or "").strip()
        }

        locs_block = plot_data.get("locations") or {}
        location_ids: set[str] = {
            l["location_id"]
            for l in ((locs_block.get("locations") or []) if isinstance(locs_block, dict) else [])
            if l.get("location_id")
        }

        chapters_block = (plot_data.get("chapter_or_episode_list") or {}).get("chapters") or []
        chapter_ids: set[str] = {c["chapter_id"] for c in chapters_block if c.get("chapter_id")}

        rel_ids: set[str] = {
            r["relationship_id"]
            for r in ((char_data.get("character_relationship_map") or {}).get("relationships") or [])
            if r.get("relationship_id")
        }

        # chapter_script — panel location_id and dialogue speaker_id
        for page in script_data.get("pages") or []:
            for panel in page.get("panels") or []:
                pid = panel.get("panel_id", "?")
                loc_id = panel.get("location_id") or ""
                if loc_id and loc_id not in location_ids:
                    warnings.append(f"chapter_script panel {pid}: location_id={loc_id!r} not in locations")
                for dlg in panel.get("dialogue") or []:
                    spk = (dlg.get("speaker_id") or dlg.get("speaker") or "").strip()
                    if spk and spk != "Narrator" and spk not in profile_ids and spk.lower() not in profile_names:
                        warnings.append(f"chapter_script panel {pid}: speaker {spk!r} not in character profiles")

        # plot_outline scene_cards — chapter_id and location_id
        for scene in ((plot_data.get("scene_cards") or {}).get("scenes") or []):
            sid = scene.get("scene_id", "?")
            sc_ch = scene.get("chapter_id") or ""
            if sc_ch and sc_ch not in chapter_ids:
                warnings.append(f"plot_outline scene {sid}: chapter_id={sc_ch!r} not in chapter list")
            sc_loc = scene.get("location_id") or ""
            if sc_loc and sc_loc not in location_ids:
                warnings.append(f"plot_outline scene {sid}: location_id={sc_loc!r} not in locations")

        # plot_threads — character_id and relationship_id
        threads = plot_data.get("plot_threads") or {}
        for ct in threads.get("character_arc_threads") or []:
            c_id = ct.get("character_id") or ""
            if c_id and c_id not in profile_ids:
                warnings.append(
                    f"plot_outline character_arc_thread {ct.get('character_name', '?')!r}: "
                    f"character_id={c_id!r} not in profiles"
                )
        for rt in threads.get("relationship_threads") or []:
            r_id = rt.get("relationship_id") or ""
            if r_id and r_id not in rel_ids:
                warnings.append(
                    f"plot_outline relationship_thread {rt.get('thread_title', '?')!r}: "
                    f"relationship_id={r_id!r} not in relationship map"
                )

        return warnings

    def validate_content_safety(self, *, text: str, context: str = "free_writing") -> list[str]:
        warnings: list[str] = []
        if not text or not text.strip():
            warnings.append(f"{context}: text is empty — content cannot be processed.")
        if len(text.strip()) < 10 and len(text.strip()) > 0:
            warnings.append(f"{context}: text is very short (<10 chars) — may produce poor analysis results.")
        return warnings
