from __future__ import annotations

import concurrent.futures
import copy
import logging
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService
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

if TYPE_CHECKING:
    from app.services.llm_service import LLMService

logger = logging.getLogger("manga.chapter_script")


class ChapterScriptService:
    """Manga script editor for chapter_script.json.

    Supports: generate from workspace (with LLM enhancement when configured),
    panel/page patching, event extraction, and approval.
    """

    def __init__(
        self,
        *,
        registry: SQLiteRegistry,
        snapshot_service: SnapshotService,
        validator: ValidationService,
        llm_service: "LLMService | None" = None,
    ):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator
        self.llm_service = llm_service

    def get_script(self, story_id: str, chapter_id: str = "") -> dict[str, Any]:
        """Return the chapter script. If chapter_id is given and doesn't match the
        current working file, walk version history and return that chapter's snapshot.
        """
        record = self._get_record(story_id)
        current_data = record["json_copy"]
        current_chapter_id = (current_data.get("chapter_metadata") or {}).get("chapter_id", "")
        unlock = self.get_unlock_status(story_id)

        if not chapter_id or chapter_id == current_chapter_id:
            response = self._response(record, current_data)
            response["unlock"] = unlock
            response["source"] = "current"
            return response

        # Look up the chapter in version snapshots — latest version wins.
        snapshots = self.registry.list_files_across_versions(story_id, "chapter_script")
        match = None
        for row in snapshots:
            data = row.get("json_copy", {}) or {}
            if (data.get("chapter_metadata") or {}).get("chapter_id") == chapter_id:
                match = (row, data)
        if match:
            row, data = match
            response = self._response(row, data)
            response["unlock"] = unlock
            response["source"] = "version_history"
            response["source_version_id"] = row.get("version_id", "")
            response["source_version_number"] = row.get("version_number")
            return response

        # Chapter exists in plot_outline but no script generated yet.
        plot_record = self.registry.get_current_file(story_id, "plot_outline")
        plot = plot_record["json_copy"] if plot_record else {}
        chapters = (plot.get("chapter_or_episode_list") or {}).get("chapters", []) or []
        chapter = next((c for c in chapters if isinstance(c, dict) and c.get("chapter_id") == chapter_id), None)
        empty_metadata = {
            "chapter_id": chapter_id,
            "chapter_number": (chapter or {}).get("chapter_number"),
            "chapter_title": (chapter or {}).get("chapter_title", ""),
            "chapter_status": "not_generated",
            "approved_as_official": False,
        }
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "chapter_script",
            "state_type": current_data.get("state_type", "template_state"),
            "script_id": "",
            "chapter_status": "not_generated",
            "content": {
                "story_id": story_id,
                "chapter_metadata": empty_metadata,
                "chapter_purpose": {},
                "linked_story_context": {},
                "chapter_scene_breakdown": [],
                "pages": [],
                "approval": {"script_approved_by_user": False, "ready_for_memory_update": False},
                "chapter_event_extraction": {"status": "not_started", "detected_events_from_script": []},
            },
            "unlock": unlock,
            "source": "not_generated",
        }

    def get_unlock_status(self, story_id: str) -> dict[str, Any]:
        """Report whether the manga script panel is unlocked, the current phase,
        and the exact next action the user needs to take.

        Required to UNLOCK the panel (gate-keepers):
          1. plot_outline.json exists
          2. story_integrity_lock is NOT locked
          3. plot_outline has at least one chapter

        plot_threads and scene_cards are OPTIONAL enrichment — if present they
        produce a richer script, but the generator can work from chapter data alone.
        The plot_workspace (Writing Desk) is also OPTIONAL.
        """
        plot_record = self.registry.get_current_file(story_id, "plot_outline")
        plot = plot_record["json_copy"] if plot_record else {}
        raw_chapters = plot.get("chapter_or_episode_list", {}).get("chapters", []) if plot else []
        chapters = meaningful_chapters(raw_chapters)
        lock = plot.get("story_integrity_lock", {}) if plot else {}

        blockers: list[dict[str, str]] = []
        if not plot_record:
            blockers.append({
                "code": "PLOT_OUTLINE_MISSING",
                "message": "Create a plot outline before generating the manga script.",
                "fix_route": "/plot-outline",
            })
        if lock.get("locked"):
            blockers.append({
                "code": "INTEGRITY_LOCKED",
                "message": f"Resolve the story integrity lock (deleted chapter #{lock.get('deleted_chapter_number')}) first.",
                "fix_route": "/plot-outline#integrity-lock",
            })
        if plot_record and not chapters:
            blockers.append({
                "code": "NO_CHAPTERS",
                "message": "Add at least one chapter to the plot outline.",
                "fix_route": "/plot-outline/chapters",
            })

        # Determine current phase + the explicit next action
        script_record = self.registry.get_current_file(story_id, "chapter_script")
        script_data = script_record["json_copy"] if script_record else {}
        has_real_pages = script_has_meaningful_pages(script_data)
        approved = bool(script_data.get("approval", {}).get("script_approved_by_user", False))
        events_done = script_data.get("chapter_event_extraction", {}).get("status") == "completed"
        next_version_id = script_data.get("memory_update_plan_after_chapter", {}).get("next_version_id", "")

        if next_version_id:
            phase = "completed"
            next_method = None
            next_method_label = "All done. Start the next chapter via Plot Outline → Chapters."
        elif approved and events_done:
            phase = "events_extracted"
            next_method = {
                "method": "POST",
                "endpoint": f"/api/v1/stories/{story_id}/versions/create-from-approved-events",
                "label": "Create next version bundle",
            }
        elif approved:
            phase = "approved"
            next_method = {
                "method": "POST",
                "endpoint": f"/api/v1/stories/{story_id}/chapter-script/extract-events",
                "label": "Extract story events from script",
            }
        elif has_real_pages:
            phase = "generated"
            next_method = {
                "method": "POST",
                "endpoint": f"/api/v1/stories/{story_id}/chapter-script/approve",
                "label": "Approve script",
            }
        elif blockers:
            phase = "locked"
            next_method = {
                "method": None,
                "endpoint": None,
                "label": f"Resolve {len(blockers)} blocker(s) above to unlock the panel.",
            }
        else:
            phase = "ready"
            next_method = {
                "method": "POST",
                "endpoint": f"/api/v1/stories/{story_id}/chapter-script/generate",
                "label": "Generate manga script",
            }

        return {
            "unlocked": not blockers,
            "phase": phase,
            "blockers": blockers,
            "next_method": next_method,
            "lifecycle": ["locked", "ready", "generated", "approved", "events_extracted", "completed"],
            "writing_desk_note": "Writing Desk (plot_workspace) is OPTIONAL — only used to expand a rough idea before generation.",
        }

    def get_chapters_script_status(self, story_id: str) -> dict[str, Any]:
        """Return per-chapter script status for all chapters in the plot outline.

        Walks all version snapshots of chapter_script.json (same pattern as export._all_chapter_scripts)
        plus the current working file to determine which chapters have generated scripts.
        """
        plot_record = self.registry.get_current_file(story_id, "plot_outline")
        plot = plot_record["json_copy"] if plot_record else {}
        chapters = meaningful_chapters((plot.get("chapter_or_episode_list") or {}).get("chapters", []) or [])

        snapshots = self.registry.list_files_across_versions(story_id, "chapter_script")
        generated: dict[str, dict[str, Any]] = {}
        for row in snapshots:
            data = row.get("json_copy", {}) or {}
            ch_id = (data.get("chapter_metadata") or {}).get("chapter_id", "")
            has_real_pages = script_has_meaningful_pages(data)
            if ch_id and has_real_pages:
                generated[ch_id] = {
                    "chapter_status": (data.get("chapter_metadata") or {}).get("chapter_status", "draft"),
                    "approved": (data.get("approval") or {}).get("script_approved_by_user", False),
                    "pages_count": meaningful_page_count(data),
                    "version_id": row.get("version_id", ""),
                    "version_number": row.get("version_number"),
                }

        current_record = self.registry.get_current_file(story_id, "chapter_script")
        current_chapter_id = ""
        if current_record:
            cur_data = current_record.get("json_copy", {}) or {}
            cur_ch_id = (cur_data.get("chapter_metadata") or {}).get("chapter_id", "")
            current_chapter_id = cur_ch_id
            has_real_pages = script_has_meaningful_pages(cur_data)
            if cur_ch_id and has_real_pages:
                generated[cur_ch_id] = {
                    "chapter_status": (cur_data.get("chapter_metadata") or {}).get("chapter_status", "draft"),
                    "approved": (cur_data.get("approval") or {}).get("script_approved_by_user", False),
                    "pages_count": meaningful_page_count(cur_data),
                    "version_id": current_record.get("version_id", ""),
                    "version_number": None,
                    "is_current": True,
                }

        result: list[dict[str, Any]] = []
        for ch in chapters:
            ch_id = ch.get("chapter_id", "")
            status = generated.get(ch_id, {})
            result.append({
                "chapter_id": ch_id,
                "chapter_number": ch.get("chapter_number"),
                "chapter_title": ch.get("chapter_title", ""),
                "has_script": ch_id in generated,
                "chapter_status": status.get("chapter_status", "not_generated"),
                "approved": status.get("approved", False),
                "pages_count": status.get("pages_count", 0),
                "version_id": status.get("version_id", ""),
                "version_number": status.get("version_number"),
                "is_current": status.get("is_current", False),
            })
        return {
            "story_id": story_id,
            "chapters": result,
            "current_chapter_id": current_chapter_id,
        }

    def load_from_history(self, story_id: str, chapter_id: str) -> dict[str, Any]:
        """Load a previously-generated chapter script from version history back into
        the current working file so the user can edit it.

        Guards against overwriting unapproved current pages (same MUST_APPROVE_CURRENT_CHAPTER
        pattern as generate_from_workspace).  Does NOT create a new version — the user must
        re-approve after editing.
        """
        if not chapter_id:
            raise MangaMakerError("MISSING_CHAPTER_ID", "chapter_id query parameter is required.", status_code=400)

        record, current_data = self._editable(story_id)
        current_chapter_id = (current_data.get("chapter_metadata") or {}).get("chapter_id", "")
        current_has_pages = script_has_meaningful_pages(current_data)
        current_approved = (current_data.get("approval") or {}).get("script_approved_by_user", False)

        if current_chapter_id == chapter_id:
            return {
                "story_id": story_id,
                "version_id": record["version_id"],
                "chapter_id": chapter_id,
                "already_loaded": True,
                "message": "This chapter is already the current working script.",
            }

        if current_has_pages and current_chapter_id and not current_approved:
            raise MangaMakerError(
                "MUST_APPROVE_CURRENT_CHAPTER",
                f"Cannot load chapter {chapter_id} because chapter {current_chapter_id} "
                "has unapproved script pages. Approve the current chapter (which creates a "
                "version snapshot) before loading a different one.",
                status_code=409,
            )

        snapshots = self.registry.list_files_across_versions(story_id, "chapter_script")
        historical_data = None
        historical_version_id = ""
        for row in snapshots:
            data = row.get("json_copy", {}) or {}
            if (data.get("chapter_metadata") or {}).get("chapter_id") == chapter_id:
                historical_data = data
                historical_version_id = row.get("version_id", "")

        if not historical_data:
            raise MangaMakerError(
                "CHAPTER_NOT_IN_HISTORY",
                f"No version-history snapshot found for chapter {chapter_id}. "
                "Generate the chapter script first.",
                status_code=404,
            )

        if not historical_data.get("pages", []):
            raise MangaMakerError(
                "CHAPTER_SCRIPT_EMPTY",
                f"Version-history snapshot for chapter {chapter_id} has no pages. "
                "Regenerate the chapter instead.",
                status_code=400,
            )

        fields_to_load = [
            "chapter_metadata", "chapter_purpose", "linked_story_context",
            "chapter_scene_breakdown", "pages", "chapter_dialogue_index",
            "chapter_visual_index", "chapter_event_extraction", "continuity_checks",
            "approval", "custom_chapter_script_details",
        ]
        for field in fields_to_load:
            if field in historical_data:
                current_data[field] = copy.deepcopy(historical_data[field])

        metadata = current_data.setdefault("chapter_metadata", {})
        metadata["chapter_status"] = "loaded_for_editing"
        metadata["approved_as_official"] = False
        current_data.setdefault("approval", {})["script_approved_by_user"] = False
        current_data.setdefault("memory_update_plan_after_chapter", {})["next_version_id"] = ""

        self._save(story_id, record, current_data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "chapter_id": chapter_id,
            "loaded_from_version": historical_version_id,
            "pages_count": len(current_data.get("pages", [])),
            "chapter_status": metadata["chapter_status"],
            "message": f"Chapter {chapter_id} loaded into working file. Edit and re-approve to save.",
        }

    def validate_script(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        self._validate_runtime(record["json_copy"], story_id=story_id, version_id=record["version_id"])

        # Cross-file ID reference check — warns about dangling IDs without raising
        cross_ref_files: dict[str, Any] = {"chapter_script": record["json_copy"]}
        for ft in ("characters", "plot_outline"):
            rec = self.registry.get_current_file(story_id, ft)
            if rec:
                cross_ref_files[ft] = rec.get("json_copy", {})
        cross_ref_warnings = self.validator.validate_cross_references(cross_ref_files)

        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "chapter_script",
            "validation_status": "passed" if not cross_ref_warnings else "warnings",
            "checks": [
                "story_id matches registry",
                "version_id matches current version",
                "file_type is chapter_script",
                "state_type is template_state",
                "linked_files use clean official names",
                "script_format.format_type is manga_script",
                "chapter -> scenes -> pages -> panels structure exists",
            ],
            "cross_ref_warnings": cross_ref_warnings,
        }

    def generate_from_workspace(self, story_id: str, chapter_id: str = "") -> dict[str, Any]:
        script_record, script = self._editable(story_id)
        plot_outline = self._current_file(story_id, "plot_outline")["json_copy"]
        # Workspace is OPTIONAL — only used as expansion when present.
        workspace_record = self.registry.get_current_file(story_id, "plot_workspace")
        workspace = workspace_record["json_copy"] if workspace_record else {}

        # ── unlock guard ──────────────────────────────────────────────────────
        lock = plot_outline.get("story_integrity_lock", {})
        if lock.get("locked"):
            raise MangaMakerError(
                "INTEGRITY_LOCKED",
                f"Resolve the story integrity lock (deleted chapter #{lock.get('deleted_chapter_number')}) "
                "before generating a chapter script.",
                status_code=400,
            )

        # ── guard: require at least one named location ────────────────────────
        locs_block = plot_outline.get("locations", {})
        named_locs = [
            l for l in ((locs_block.get("locations", []) if isinstance(locs_block, dict) else []) or [])
            if isinstance(l, dict) and l.get("name")
        ]
        if not named_locs:
            raise MangaMakerError(
                "LOCATIONS_REQUIRED",
                "Add at least one named location in the Locations page before generating a chapter script. "
                "Panels are assigned to locations during generation.",
                status_code=400,
            )
        loc_name_to_id: dict[str, str] = {
            l["name"].strip().lower(): l.get("location_id", "")
            for l in named_locs
            if l.get("name") and l.get("location_id")
        }

        # ── chapter + scenes ──────────────────────────────────────────────────
        chapter = self._find_chapter(plot_outline, chapter_id)
        chapter_id_used = chapter.get("chapter_id", "ch_001")
        scenes = self._find_scenes_for_chapter(plot_outline, chapter_id_used)

        if not chapter_has_content(chapter):
            raise MangaMakerError(
                "NO_CHAPTERS",
                "Add at least one real chapter to the plot outline before generating the script.",
                status_code=400,
            )

        # ── guard: prevent overwriting an unapproved chapter script ──────────
        current_chapter_id = (script.get("chapter_metadata") or {}).get("chapter_id", "")
        current_has_pages = script_has_meaningful_pages(script)
        current_approved = (script.get("approval") or {}).get("script_approved_by_user", False)
        if current_has_pages and current_chapter_id and current_chapter_id != chapter_id_used and not current_approved:
            raise MangaMakerError(
                "MUST_APPROVE_CURRENT_CHAPTER",
                f"Cannot generate chapter {chapter_id_used} because chapter {current_chapter_id} "
                "has unapproved script pages. Approve the current chapter (which will create a "
                "version snapshot) before generating a new one.",
                status_code=409,
            )

        # ── scene fallback: synthesise from chapter if no scene cards exist ──
        if not scenes:
            scenes = [{
                "scene_id": f"scene_{chapter_id_used}_auto",
                "scene_order": 1,
                "scene_title": chapter.get("chapter_title", "Scene 1"),
                "scene_goal": chapter.get("chapter_purpose") or chapter.get("summary", ""),
                "scene_conflict": chapter.get("main_conflict", ""),
                "visual_manga_moment": chapter.get("twist_or_hook", ""),
                "panel_mood": chapter.get("emotional_beat", ""),
                "ending_beat": chapter.get("ending_cliffhanger", ""),
                "location": "",
                "time": "",
                "characters_present": chapter.get("characters_present", []),
                "relationship_dynamic_used": "",
                "new_information_revealed": "",
                "action_or_dialogue_focus": "",
                "custom_scene_details": "",
            }]

        # ── source text: workspace expansion if present, else chapter summary ─
        final_text = (
            workspace.get("ai_completion", {}).get("final_text_used_for_analysis")
            or workspace.get("user_free_writing", {}).get("text", "")
            or ""
        ).strip()
        used_workspace = bool(final_text)
        if not final_text:
            # Build deterministic source text from plot data alone.
            parts: list[str] = []
            if chapter.get("summary"):
                parts.append(chapter["summary"])
            if chapter.get("main_conflict"):
                parts.append(f"Main conflict: {chapter['main_conflict']}")
            if chapter.get("emotional_beat"):
                parts.append(f"Emotional beat: {chapter['emotional_beat']}")
            if chapter.get("ending_cliffhanger"):
                parts.append(f"Ending: {chapter['ending_cliffhanger']}")
            for s in scenes:
                if s.get("scene_goal"):
                    parts.append(f"Scene goal: {s['scene_goal']}")
                if s.get("visual_manga_moment"):
                    parts.append(f"Visual moment: {s['visual_manga_moment']}")
            final_text = " ".join(parts) or f"Chapter {chapter.get('chapter_number', '?')} script."

        # ── chapter_metadata (all fields) ─────────────────────────────────────
        metadata = script.setdefault("chapter_metadata", {})
        metadata["chapter_id"] = chapter_id_used
        metadata["chapter_number"] = chapter.get("chapter_number", metadata.get("chapter_number", 1))
        metadata["chapter_title"] = chapter.get("chapter_title", metadata.get("chapter_title", ""))
        metadata["chapter_status"] = "generated"
        metadata["created_from_workspace_id"] = workspace.get("workspace_id", "") if used_workspace else ""
        metadata["created_from_plot_outline_chapter_id"] = chapter_id_used
        metadata["generation_source"] = "workspace_expansion" if used_workspace else "plot_outline_only"
        metadata["approved_as_official"] = False

        # ── chapter_purpose (all template fields) ─────────────────────────────
        purpose = script.setdefault("chapter_purpose", {})
        purpose["summary"] = chapter.get("summary") or final_text[:300]
        purpose["chapter_goal"] = chapter.get("chapter_purpose", purpose.get("chapter_goal", ""))
        purpose["reader_question"] = (
            plot_outline.get("story_arc_overview", {}).get("main_story_question", "")
            or chapter.get("twist_or_hook", "")
        )
        purpose["opening_hook"] = scenes[0].get("scene_goal", "") if scenes and scenes[0] else ""
        purpose["ending_hook"] = chapter.get("ending_cliffhanger", purpose.get("ending_hook", ""))
        purpose["main_conflict"] = chapter.get("main_conflict", purpose.get("main_conflict", ""))
        purpose["main_emotional_beat"] = chapter.get("emotional_beat", purpose.get("main_emotional_beat", ""))
        rels_used = chapter.get("relationships_used", [])
        purpose["main_relationship_dynamic"] = ", ".join(rels_used) if isinstance(rels_used, list) else str(rels_used)
        world_rules = chapter.get("world_rules_shown", [])
        purpose["main_world_rule_shown"] = ", ".join(world_rules) if isinstance(world_rules, list) else str(world_rules)
        powers = chapter.get("power_system_shown", [])
        purpose["main_power_or_ability_shown"] = ", ".join(powers) if isinstance(powers, list) else str(powers)
        threats = chapter.get("threats_used", [])
        purpose["threat_hint_or_reveal"] = ", ".join(threats) if isinstance(threats, list) else str(threats)
        purpose["custom_chapter_purpose_details"] = chapter.get("custom_chapter_details", "")

        # ── chapter_scene_breakdown (all scenes) ──────────────────────────────
        script["chapter_scene_breakdown"] = [
            {
                "scene_id": s.get("scene_id", f"scene_{i + 1:03d}"),
                "scene_order": s.get("scene_order", i + 1),
                "scene_title": s.get("scene_title", f"Scene {i + 1}"),
                "scene_purpose": s.get("scene_goal") or "Turn approved workspace writing into a clean manga scene.",
                "location": s.get("location", ""),
                "location_id": loc_name_to_id.get((s.get("location") or "").strip().lower(), ""),
                "time": s.get("time", ""),
                "characters_present": s.get("characters_present", []),
                "relationship_dynamic_used": s.get("relationship_dynamic_used", ""),
                "scene_goal": s.get("scene_goal", ""),
                "scene_conflict": s.get("scene_conflict", chapter.get("main_conflict", "")),
                "emotional_tone": s.get("panel_mood", ""),
                "new_information_revealed": s.get("new_information_revealed", ""),
                "visual_manga_moment": s.get("visual_manga_moment", ""),
                "ending_beat": s.get("ending_beat", chapter.get("ending_cliffhanger", "")),
                "linked_plot_outline_scene_id": s.get("scene_id", f"scene_{i + 1:03d}"),
            }
            for i, s in enumerate(scenes)
        ]

        # ── pages: one page per scene, 5 panels each ─────────────────────────
        pages: list[dict[str, Any]] = []
        for page_num, scene in enumerate(scenes, start=1):
            sid = scene.get("scene_id", f"scene_{page_num:03d}")
            location = scene.get("location", "")
            visual_moment = scene.get("visual_manga_moment") or f"The scene unfolds at {location}." if location else "A key manga moment opens the scene."
            conflict = scene.get("scene_conflict") or chapter.get("main_conflict", "")
            new_info = scene.get("new_information_revealed", "")
            ending = scene.get("ending_beat") or chapter.get("ending_cliffhanger", "")
            chars = scene.get("characters_present") or chapter.get("characters_present", [])
            chars_str = ", ".join(chars) if isinstance(chars, list) else str(chars)
            mood = scene.get("panel_mood", "")

            panels = [
                self._panel(
                    f"panel_{page_num:03d}_001", 1, "Establishing Shot",
                    visual_moment, "", "",
                ),
                self._panel(
                    f"panel_{page_num:03d}_002", 2, "Wide Shot",
                    f"{chars_str or 'Characters'} in {'the ' + location if location else 'the scene'}. "
                    f"Scene goal: {scene.get('scene_goal', '')}",
                    "", "",
                ),
                self._panel(
                    f"panel_{page_num:03d}_003", 3, "Action Shot",
                    conflict or "Tension builds.",
                    "", "",
                ),
                self._panel(
                    f"panel_{page_num:03d}_004", 4, "Reaction Shot",
                    new_info or "Characters react to the unfolding events.",
                    "", "",
                ),
                self._panel(
                    f"panel_{page_num:03d}_005", 5, "Close-Up",
                    ending or "The scene ends on a forward hook.",
                    "", "",
                ),
            ]
            for p in panels:
                p["mood"] = mood

            pages.append({
                "page_id": f"page_{page_num:03d}",
                "page_number": page_num,
                "scene_id": sid,
                "location_id": loc_name_to_id.get(location.strip().lower(), ""),
                "location_name": location,
                "page_purpose": scene.get("scene_goal") or f"Script page for scene {page_num}.",
                "page_mood": mood,
                "panels": panels,
            })
        script["pages"] = pages

        # ── linked_story_context (from real chapter/scene data) ───────────────
        all_chars: list[str] = []
        all_locations: list[str] = []
        for s in scenes:
            for c in (s.get("characters_present") or []):
                if c and c not in all_chars:
                    all_chars.append(c)
            loc = s.get("location", "")
            if loc and loc not in all_locations:
                all_locations.append(loc)
        if not all_chars:
            ch_chars = chapter.get("characters_present", [])
            all_chars = ch_chars if isinstance(ch_chars, list) else []

        plot_threads = plot_outline.get("plot_threads", {}) or {}
        threads_used: list[str] = []
        main_thread = plot_threads.get("main_plot_thread", {})
        if main_thread.get("goal"):
            threads_used.append(f"main_plot_thread: {str(main_thread['goal'])[:120]}")
        for arc in plot_threads.get("character_arc_threads", []):
            if isinstance(arc, dict):
                arc_chars = arc.get("character_id", "")
                if arc_chars and any(c == arc_chars or arc_chars in c for c in all_chars):
                    threads_used.append(f"character_arc: {arc_chars}")
        for t_thread in plot_threads.get("threat_threads", []):
            if isinstance(t_thread, dict) and t_thread.get("threat_id_or_name"):
                threat_name = t_thread["threat_id_or_name"]
                ch_threats = chapter.get("threats_used", [])
                if isinstance(ch_threats, list) and any(threat_name in t for t in ch_threats):
                    threads_used.append(f"threat_thread: {threat_name}")

        linked_ctx = script.setdefault("linked_story_context", {})
        linked_ctx["characters_present"] = all_chars
        linked_ctx["relationships_used"] = chapter.get("relationships_used", []) if isinstance(chapter.get("relationships_used"), list) else []
        linked_ctx["factions_used"] = chapter.get("factions_used", []) if isinstance(chapter.get("factions_used"), list) else []
        linked_ctx["locations_used"] = all_locations
        linked_ctx["world_rules_used"] = chapter.get("world_rules_shown", []) if isinstance(chapter.get("world_rules_shown"), list) else []
        linked_ctx["powers_used"] = chapter.get("power_system_shown", []) if isinstance(chapter.get("power_system_shown"), list) else []
        linked_ctx["major_threats_used"] = chapter.get("threats_used", []) if isinstance(chapter.get("threats_used"), list) else []
        linked_ctx["minor_threats_used"] = []
        linked_ctx["plot_threads_used"] = threads_used
        linked_ctx["foreshadowing_used"] = []

        # ── chapter_visual_index (deterministic; LLM may enrich later) ───────
        important_moments: list[str] = []
        location_notes: list[str] = []
        seen_locs: set[str] = set()
        for s in scenes:
            vm = (s.get("visual_manga_moment") or "").strip()
            if vm:
                important_moments.append(f"Scene {s.get('scene_id', '?')}: {vm[:200]}")
            loc = (s.get("location") or "").strip()
            if loc and loc not in seen_locs:
                seen_locs.add(loc)
                location_notes.append(loc)
        power_notes: list[str] = []
        ch_powers = chapter.get("power_system_shown", [])
        if isinstance(ch_powers, list):
            power_notes.extend(p for p in ch_powers if isinstance(p, str) and p.strip())
        symbol_notes: list[str] = []
        if chapter.get("twist_or_hook"):
            symbol_notes.append(f"Twist/hook motif: {chapter['twist_or_hook'][:160]}")
        if chapter.get("emotional_beat"):
            symbol_notes.append(f"Emotional motif: {chapter['emotional_beat'][:160]}")
        script["chapter_visual_index"] = {
            "important_visual_moments": important_moments,
            "new_character_design_notes": [],
            "new_location_design_notes": location_notes,
            "power_visuals_used": power_notes,
            "symbolism_or_motifs_used": symbol_notes,
        }

        # ── approval / event extraction / version-link reset ─────────────────
        script.setdefault("approval", {})["script_approved_by_user"] = False
        script["approval"]["ready_for_memory_update"] = False
        script.setdefault("chapter_event_extraction", {})["status"] = "not_started"
        script["chapter_event_extraction"]["detected_events_from_script"] = []
        # A fresh generation cancels any prior "completed" carry-forward.
        script.setdefault("memory_update_plan_after_chapter", {})["next_version_id"] = ""

        # ── LLM panel enhancement ─────────────────────────────────────────────
        llm_used = False
        llm_warnings: list[str] = []
        if self.llm_service:
            llm_used, llm_warnings = self._enhance_panels_with_llm(
                story_id=story_id,
                script=script,
                chapter=chapter,
                scenes=scenes,
                final_text=final_text,
                plot_threads=plot_threads,
                plot_outline=plot_outline,
            )

        self._save(story_id, script_record, script)
        return {
            "story_id": story_id,
            "version_id": script_record["version_id"],
            "script_id": script.get("script_id", "script_ch_001"),
            "chapter_id": metadata["chapter_id"],
            "chapter_status": metadata["chapter_status"],
            "generation_source": metadata["generation_source"],
            "used_workspace_text": used_workspace,
            "pages_count": len(script.get("pages", [])),
            "panels_count": sum(len(p.get("panels", [])) for p in script.get("pages", [])),
            "scenes_used": len(scenes),
            "plot_threads_used": threads_used,
            "llm_used": llm_used,
            "llm_warnings": llm_warnings,
            "validation_status": "passed",
        }

    # ── batch generation ──────────────────────────────────────────────────────

    def _generate_chapter_no_save(
        self,
        story_id: str,
        chapter_id: str,
        plot_outline: dict[str, Any],
        workspace: dict[str, Any],
        named_locs: list[dict[str, Any]],
        loc_name_to_id: dict[str, str],
    ) -> dict[str, Any]:
        """Build chapter script content without I/O writes. Safe to call from parallel threads.

        Returns a dict of content fields plus private '_*' metadata keys.
        Caller merges the public keys into the script template, then saves.
        """
        chapter = self._find_chapter(plot_outline, chapter_id)
        chapter_id_used = chapter.get("chapter_id", chapter_id or "ch_001")
        scenes = self._find_scenes_for_chapter(plot_outline, chapter_id_used)

        if not chapter_has_content(chapter):
            raise MangaMakerError("NO_CHAPTERS", f"Chapter {chapter_id!r} has no content.", status_code=400)

        if not scenes:
            scenes = [{
                "scene_id": f"scene_{chapter_id_used}_auto",
                "scene_order": 1,
                "scene_title": chapter.get("chapter_title", "Scene 1"),
                "scene_goal": chapter.get("chapter_purpose") or chapter.get("summary", ""),
                "scene_conflict": chapter.get("main_conflict", ""),
                "visual_manga_moment": chapter.get("twist_or_hook", ""),
                "panel_mood": chapter.get("emotional_beat", ""),
                "ending_beat": chapter.get("ending_cliffhanger", ""),
                "location": "",
                "time": "",
                "characters_present": chapter.get("characters_present", []),
                "relationship_dynamic_used": "",
                "new_information_revealed": "",
                "action_or_dialogue_focus": "",
                "custom_scene_details": "",
            }]

        final_text = (
            workspace.get("ai_completion", {}).get("final_text_used_for_analysis")
            or workspace.get("user_free_writing", {}).get("text", "")
            or ""
        ).strip()
        used_workspace = bool(final_text)
        if not final_text:
            parts: list[str] = []
            if chapter.get("summary"):
                parts.append(chapter["summary"])
            if chapter.get("main_conflict"):
                parts.append(f"Main conflict: {chapter['main_conflict']}")
            if chapter.get("emotional_beat"):
                parts.append(f"Emotional beat: {chapter['emotional_beat']}")
            if chapter.get("ending_cliffhanger"):
                parts.append(f"Ending: {chapter['ending_cliffhanger']}")
            for s in scenes:
                if s.get("scene_goal"):
                    parts.append(f"Scene goal: {s['scene_goal']}")
                if s.get("visual_manga_moment"):
                    parts.append(f"Visual moment: {s['visual_manga_moment']}")
            final_text = " ".join(parts) or f"Chapter {chapter.get('chapter_number', '?')} script."

        built: dict[str, Any] = {}

        metadata = built.setdefault("chapter_metadata", {})
        metadata["chapter_id"] = chapter_id_used
        metadata["chapter_number"] = chapter.get("chapter_number", 1)
        metadata["chapter_title"] = chapter.get("chapter_title", "")
        metadata["chapter_status"] = "generated"
        metadata["created_from_workspace_id"] = workspace.get("workspace_id", "") if used_workspace else ""
        metadata["created_from_plot_outline_chapter_id"] = chapter_id_used
        metadata["generation_source"] = "workspace_expansion" if used_workspace else "plot_outline_only"
        metadata["approved_as_official"] = False

        purpose = built.setdefault("chapter_purpose", {})
        purpose["summary"] = chapter.get("summary") or final_text[:300]
        purpose["chapter_goal"] = chapter.get("chapter_purpose", "")
        purpose["reader_question"] = (
            plot_outline.get("story_arc_overview", {}).get("main_story_question", "")
            or chapter.get("twist_or_hook", "")
        )
        purpose["opening_hook"] = scenes[0].get("scene_goal", "") if scenes else ""
        purpose["ending_hook"] = chapter.get("ending_cliffhanger", "")
        purpose["main_conflict"] = chapter.get("main_conflict", "")
        purpose["main_emotional_beat"] = chapter.get("emotional_beat", "")
        rels_used = chapter.get("relationships_used", [])
        purpose["main_relationship_dynamic"] = ", ".join(rels_used) if isinstance(rels_used, list) else str(rels_used)
        world_rules = chapter.get("world_rules_shown", [])
        purpose["main_world_rule_shown"] = ", ".join(world_rules) if isinstance(world_rules, list) else str(world_rules)
        powers = chapter.get("power_system_shown", [])
        purpose["main_power_or_ability_shown"] = ", ".join(powers) if isinstance(powers, list) else str(powers)
        threats = chapter.get("threats_used", [])
        purpose["threat_hint_or_reveal"] = ", ".join(threats) if isinstance(threats, list) else str(threats)
        purpose["custom_chapter_purpose_details"] = chapter.get("custom_chapter_details", "")

        built["chapter_scene_breakdown"] = [
            {
                "scene_id": s.get("scene_id", f"scene_{i + 1:03d}"),
                "scene_order": s.get("scene_order", i + 1),
                "scene_title": s.get("scene_title", f"Scene {i + 1}"),
                "scene_purpose": s.get("scene_goal") or "Turn approved workspace writing into a clean manga scene.",
                "location": s.get("location", ""),
                "location_id": loc_name_to_id.get((s.get("location") or "").strip().lower(), ""),
                "time": s.get("time", ""),
                "characters_present": s.get("characters_present", []),
                "relationship_dynamic_used": s.get("relationship_dynamic_used", ""),
                "scene_goal": s.get("scene_goal", ""),
                "scene_conflict": s.get("scene_conflict", chapter.get("main_conflict", "")),
                "emotional_tone": s.get("panel_mood", ""),
                "new_information_revealed": s.get("new_information_revealed", ""),
                "visual_manga_moment": s.get("visual_manga_moment", ""),
                "ending_beat": s.get("ending_beat", chapter.get("ending_cliffhanger", "")),
                "linked_plot_outline_scene_id": s.get("scene_id", f"scene_{i + 1:03d}"),
            }
            for i, s in enumerate(scenes)
        ]

        pages: list[dict[str, Any]] = []
        for page_num, scene in enumerate(scenes, start=1):
            sid = scene.get("scene_id", f"scene_{page_num:03d}")
            location = scene.get("location", "")
            visual_moment = scene.get("visual_manga_moment") or (f"The scene unfolds at {location}." if location else "A key manga moment opens the scene.")
            conflict = scene.get("scene_conflict") or chapter.get("main_conflict", "")
            new_info = scene.get("new_information_revealed", "")
            ending = scene.get("ending_beat") or chapter.get("ending_cliffhanger", "")
            chars = scene.get("characters_present") or chapter.get("characters_present", [])
            chars_str = ", ".join(chars) if isinstance(chars, list) else str(chars)
            mood = scene.get("panel_mood", "")
            panels = [
                self._panel(f"panel_{page_num:03d}_001", 1, "Establishing Shot", visual_moment, "", ""),
                self._panel(f"panel_{page_num:03d}_002", 2, "Wide Shot", f"{chars_str or 'Characters'} in {'the ' + location if location else 'the scene'}. Scene goal: {scene.get('scene_goal', '')}", "", ""),
                self._panel(f"panel_{page_num:03d}_003", 3, "Action Shot", conflict or "Tension builds.", "", ""),
                self._panel(f"panel_{page_num:03d}_004", 4, "Reaction Shot", new_info or "Characters react to the unfolding events.", "", ""),
                self._panel(f"panel_{page_num:03d}_005", 5, "Close-Up", ending or "The scene ends on a forward hook.", "", ""),
            ]
            for p in panels:
                p["mood"] = mood
            pages.append({
                "page_id": f"page_{page_num:03d}",
                "page_number": page_num,
                "scene_id": sid,
                "location_id": loc_name_to_id.get(location.strip().lower(), ""),
                "location_name": location,
                "page_purpose": scene.get("scene_goal") or f"Script page for scene {page_num}.",
                "page_mood": mood,
                "panels": panels,
            })
        built["pages"] = pages

        all_chars: list[str] = []
        all_locations: list[str] = []
        for s in scenes:
            for c in (s.get("characters_present") or []):
                if c and c not in all_chars:
                    all_chars.append(c)
            loc = s.get("location", "")
            if loc and loc not in all_locations:
                all_locations.append(loc)
        if not all_chars:
            ch_chars = chapter.get("characters_present", [])
            all_chars = ch_chars if isinstance(ch_chars, list) else []

        plot_threads = plot_outline.get("plot_threads", {}) or {}
        threads_used: list[str] = []
        main_thread = plot_threads.get("main_plot_thread", {})
        if main_thread.get("goal"):
            threads_used.append(f"main_plot_thread: {str(main_thread['goal'])[:120]}")
        for arc in plot_threads.get("character_arc_threads", []):
            if isinstance(arc, dict):
                arc_chars = arc.get("character_id", "")
                if arc_chars and any(c == arc_chars or arc_chars in c for c in all_chars):
                    threads_used.append(f"character_arc: {arc_chars}")
        for t_thread in plot_threads.get("threat_threads", []):
            if isinstance(t_thread, dict) and t_thread.get("threat_id_or_name"):
                threat_name = t_thread["threat_id_or_name"]
                ch_threats = chapter.get("threats_used", [])
                if isinstance(ch_threats, list) and any(threat_name in t for t in ch_threats):
                    threads_used.append(f"threat_thread: {threat_name}")

        linked_ctx = built.setdefault("linked_story_context", {})
        linked_ctx["characters_present"] = all_chars
        linked_ctx["relationships_used"] = chapter.get("relationships_used", []) if isinstance(chapter.get("relationships_used"), list) else []
        linked_ctx["factions_used"] = chapter.get("factions_used", []) if isinstance(chapter.get("factions_used"), list) else []
        linked_ctx["locations_used"] = all_locations
        linked_ctx["world_rules_used"] = chapter.get("world_rules_shown", []) if isinstance(chapter.get("world_rules_shown"), list) else []
        linked_ctx["powers_used"] = chapter.get("power_system_shown", []) if isinstance(chapter.get("power_system_shown"), list) else []
        linked_ctx["major_threats_used"] = chapter.get("threats_used", []) if isinstance(chapter.get("threats_used"), list) else []
        linked_ctx["minor_threats_used"] = []
        linked_ctx["plot_threads_used"] = threads_used
        linked_ctx["foreshadowing_used"] = []

        important_moments: list[str] = []
        location_notes: list[str] = []
        seen_locs: set[str] = set()
        for s in scenes:
            vm = (s.get("visual_manga_moment") or "").strip()
            if vm:
                important_moments.append(f"Scene {s.get('scene_id', '?')}: {vm[:200]}")
            loc = (s.get("location") or "").strip()
            if loc and loc not in seen_locs:
                seen_locs.add(loc)
                location_notes.append(loc)
        power_notes: list[str] = []
        ch_powers = chapter.get("power_system_shown", [])
        if isinstance(ch_powers, list):
            power_notes.extend(p for p in ch_powers if isinstance(p, str) and p.strip())
        symbol_notes: list[str] = []
        if chapter.get("twist_or_hook"):
            symbol_notes.append(f"Twist/hook motif: {chapter['twist_or_hook'][:160]}")
        if chapter.get("emotional_beat"):
            symbol_notes.append(f"Emotional motif: {chapter['emotional_beat'][:160]}")
        built["chapter_visual_index"] = {
            "important_visual_moments": important_moments,
            "new_character_design_notes": [],
            "new_location_design_notes": location_notes,
            "power_visuals_used": power_notes,
            "symbolism_or_motifs_used": symbol_notes,
        }

        built["approval"] = {"script_approved_by_user": False, "ready_for_memory_update": False}
        built["chapter_event_extraction"] = {"status": "not_started", "detected_events_from_script": []}
        built["memory_update_plan_after_chapter"] = {"next_version_id": ""}

        llm_used = False
        llm_warnings: list[str] = []
        if self.llm_service:
            temp_script: dict[str, Any] = {"story_id": story_id, "pages": built["pages"]}
            llm_used, llm_warnings = self._enhance_panels_with_llm(
                story_id=story_id,
                script=temp_script,
                chapter=chapter,
                scenes=scenes,
                final_text=final_text,
                plot_threads=plot_threads,
                plot_outline=plot_outline,
            )
            built["pages"] = temp_script["pages"]

        built["_llm_used"] = llm_used
        built["_llm_warnings"] = llm_warnings
        built["_used_workspace"] = used_workspace
        built["_scenes_count"] = len(scenes)
        built["_threads_used"] = threads_used
        return built

    def fill_visuals_batch_all(
        self,
        story_id: str,
        chapter_ids: list[str],
        available_locations: list[dict[str, Any]],
        *,
        llm_service: Any,
        version_service: Any,
    ) -> dict[str, Any]:
        """Fill ALL chapters' panel visuals sequentially, one LLM call per chapter.

        Each call receives a slim context containing only the current chapter's data
        and the characters present in it — not the entire story — to keep prompts small.
        """
        # Load only the files needed to build slim per-chapter context.
        ms_rec = self.registry.get_current_file(story_id, "master_story")
        ms = (ms_rec.get("json_copy") or {}) if ms_rec else {}

        chars_rec = self.registry.get_current_file(story_id, "characters")
        chars = (chars_rec.get("json_copy") or {}) if chars_rec else {}

        plot_rec = self.registry.get_current_file(story_id, "plot_outline")
        plot = (plot_rec.get("json_copy") or {}) if plot_rec else {}

        # Pre-index characters by lowercased name for fast per-chapter filtering.
        major_profiles: list[dict[str, Any]] = [
            p for p in (chars.get("created_major_character_profiles") or []) if isinstance(p, dict)
        ]
        side_profiles: list[dict[str, Any]] = [
            p for p in (chars.get("created_side_character_profiles") or []) if isinstance(p, dict)
        ]

        # Pre-index plot-outline chapters by chapter_id.
        po_chapters = (plot.get("chapter_or_episode_list") or {}).get("chapters") or []
        po_by_id: dict[str, dict[str, Any]] = {
            ch.get("chapter_id"): ch for ch in po_chapters if isinstance(ch, dict)
        }

        # Collect latest chapter-script data per chapter from version history.
        rows = self.registry.list_files_across_versions(story_id, "chapter_script")
        by_chapter: dict[str, dict[str, Any]] = {}
        for row in rows:
            data = row.get("json_copy", {}) or {}
            ch_id = ((data.get("chapter_metadata") or {}).get("chapter_id") or "").strip()
            if ch_id and data.get("pages"):
                by_chapter[ch_id] = data  # later row = newer version wins
        # Also include the current working slot.
        current_rec = self.registry.get_current_file(story_id, "chapter_script")
        if current_rec:
            data = current_rec.get("json_copy", {}) or {}
            ch_id = ((data.get("chapter_metadata") or {}).get("chapter_id") or "").strip()
            if ch_id and data.get("pages"):
                by_chapter[ch_id] = data

        if chapter_ids:
            id_set = set(chapter_ids)
            id_order = {cid: i for i, cid in enumerate(chapter_ids)}
            chapters_to_process = sorted(
                [(ch_id, data) for ch_id, data in by_chapter.items() if ch_id in id_set],
                key=lambda x: id_order.get(x[0], 999),
            )
        else:
            chapters_to_process = sorted(
                by_chapter.items(),
                key=lambda x: (x[1].get("chapter_metadata") or {}).get("chapter_number", 999),
            )

        if not chapters_to_process:
            raise MangaMakerError("NO_CHAPTERS", "No chapters with script pages found.", status_code=400)

        _TEXT_FIELDS = ["visual", "character_action", "background_details",
                        "facial_expression", "pose_or_body_language", "mood", "narration"]

        summary: list[dict[str, Any]] = []
        for ch_id, ch_data in chapters_to_process:
            try:
                ch_meta = ch_data.get("chapter_metadata") or {}
                po_ch = po_by_id.get(ch_id) or {}

                # Filter characters to only those present in this chapter.
                present_raw = ch_meta.get("characters_present") or po_ch.get("characters_present") or []
                present_lower = {str(n).strip().lower() for n in present_raw if n}
                chapter_major = [p for p in major_profiles if (p.get("character_name") or "").strip().lower() in present_lower]
                chapter_side = [p for p in side_profiles if (p.get("character_name") or "").strip().lower() in present_lower]
                # Fallback: send up to 4 major profiles when no match found.
                if not chapter_major and not chapter_side:
                    chapter_major = major_profiles[:4]

                # Slim context: story essentials + this chapter only.
                slim_context: dict[str, Any] = {
                    "master_story": {
                        "idea_so_far": (ms.get("idea_so_far") or "")[:200],
                        "world_type": ms.get("world_type") or {},
                        "faction_visual_signatures": ms.get("faction_visual_signatures") or {},
                    },
                    "characters": {
                        "created_major_character_profiles": chapter_major,
                        "created_side_character_profiles": chapter_side,
                    },
                    "plot_outline": {
                        "chapter_or_episode_list": {"chapters": [po_ch] if po_ch else []},
                    },
                }

                fill_result = llm_service.fill_chapter_panels_batch(
                    story_id=story_id,
                    chapter_metadata=ch_meta,
                    pages=ch_data.get("pages") or [],
                    available_locations=available_locations,
                    context=slim_context,
                )

                panels_map: dict[str, Any] = fill_result.get("panels") or {}
                if not panels_map:
                    summary.append({"chapter_id": ch_id, "status": "skipped", "reason": "LLM returned no panels"})
                    continue

                # Load chapter into working slot and apply fills.
                record, script = self._editable(story_id)
                load_fields = [
                    "chapter_metadata", "chapter_purpose", "linked_story_context",
                    "chapter_scene_breakdown", "pages", "chapter_dialogue_index",
                    "chapter_visual_index", "chapter_event_extraction", "continuity_checks",
                    "approval", "custom_chapter_script_details",
                ]
                for field in load_fields:
                    if field in ch_data:
                        script[field] = copy.deepcopy(ch_data[field])
                script.setdefault("chapter_metadata", {})["chapter_status"] = "generated"
                script.setdefault("approval", {})["script_approved_by_user"] = False
                script.setdefault("memory_update_plan_after_chapter", {})["next_version_id"] = ""

                pages = script.get("pages", []) or []
                for page in pages:
                    for panel in (page.get("panels") or []):
                        pid = panel.get("panel_id", "")
                        filled = panels_map.get(pid)
                        if not filled:
                            continue
                        for f in _TEXT_FIELDS:
                            val = filled.get(f)
                            if val is None:
                                continue
                            if isinstance(val, dict):
                                val = val.get("selected", "") if "selected" in val else str(val)
                            s = str(val).strip()
                            if s:
                                panel[f] = s
                        if filled.get("location_id"):
                            panel["location_id"] = str(filled["location_id"]).strip()
                        if filled.get("render_mode"):
                            rm = filled["render_mode"]
                            if isinstance(rm, str):
                                panel["render_mode"] = {"selected": rm, "options": ["t2i", "i2i", "layered"]}
                script["pages"] = pages

                self._save(story_id, record, script)
                approve_result = self.approve_script(story_id, chapter_id=ch_id)

                try:
                    candidate = version_service.create_simple_snapshot(story_id)
                    version_id = candidate["version_id"]
                    official = version_service.mark_official(story_id, version_id)
                    approve_result["created_version_id"] = version_id
                    approve_result["version_status"] = official.get("status", "official")
                except Exception as exc:
                    approve_result["version_error"] = str(exc)

                summary.append({
                    "chapter_id": ch_id,
                    "status": "done",
                    "panels_filled": len(panels_map),
                    "warnings": fill_result.get("warnings", []),
                    **approve_result,
                })
            except Exception as exc:
                logger.error("[VIS BATCH] chapter %s failed: %s", ch_id, exc)
                summary.append({"chapter_id": ch_id, "status": "error", "error": str(exc)})

        return {
            "chapters_processed": sum(1 for s in summary if s.get("status") == "done"),
            "chapters_skipped": sum(1 for s in summary if s.get("status") == "skipped"),
            "chapters_failed": sum(1 for s in summary if s.get("status") == "error"),
            "results": summary,
        }

    def generate_batch_and_approve(
        self,
        story_id: str,
        chapter_ids: list[str],
        *,
        version_service: Any,
    ) -> dict[str, Any]:
        """Generate all requested chapters with parallel LLM calls, then sequentially write+approve+snapshot.

        LLM calls run concurrently (up to 5 at once). Disk writes, approvals, and version
        snapshots are sequential to avoid registry race conditions. Safe to call for all
        chapters at once — replaces the frontend per-chapter loop.
        """
        plot_outline = self._current_file(story_id, "plot_outline")["json_copy"]

        lock = plot_outline.get("story_integrity_lock", {})
        if lock.get("locked"):
            raise MangaMakerError(
                "INTEGRITY_LOCKED",
                f"Resolve the story integrity lock (deleted chapter #{lock.get('deleted_chapter_number')}) before generating.",
                status_code=400,
            )

        locs_block = plot_outline.get("locations", {})
        named_locs = [
            l for l in ((locs_block.get("locations", []) if isinstance(locs_block, dict) else []) or [])
            if isinstance(l, dict) and l.get("name")
        ]
        if not named_locs:
            raise MangaMakerError("LOCATIONS_REQUIRED", "Add at least one named location before generating chapter scripts.", status_code=400)
        loc_name_to_id: dict[str, str] = {
            l["name"].strip().lower(): l.get("location_id", "")
            for l in named_locs
            if l.get("name") and l.get("location_id")
        }

        workspace_record = self.registry.get_current_file(story_id, "plot_workspace")
        workspace = workspace_record["json_copy"] if workspace_record else {}

        all_chapters = plot_outline.get("chapter_or_episode_list", {}).get("chapters", [])
        if chapter_ids:
            id_order = {cid: i for i, cid in enumerate(chapter_ids)}
            id_set = set(chapter_ids)
            chapters_to_process = sorted(
                [ch for ch in all_chapters if ch.get("chapter_id") in id_set and chapter_has_content(ch)],
                key=lambda ch: id_order.get(ch.get("chapter_id", ""), 999),
            )
        else:
            chapters_to_process = [ch for ch in all_chapters if chapter_has_content(ch)]

        if not chapters_to_process:
            raise MangaMakerError("NO_CHAPTERS", "No chapters with content found to generate.", status_code=400)

        built_by_id: dict[str, dict[str, Any]] = {}
        errors_by_id: dict[str, str] = {}

        def _build_one(ch: dict[str, Any]) -> tuple[str, dict[str, Any]]:
            ch_id = ch.get("chapter_id", "")
            return ch_id, self._generate_chapter_no_save(story_id, ch_id, plot_outline, workspace, named_locs, loc_name_to_id)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            future_map = {executor.submit(_build_one, ch): ch for ch in chapters_to_process}
            for future in concurrent.futures.as_completed(future_map):
                ch = future_map[future]
                ch_id = ch.get("chapter_id", "")
                try:
                    result_id, built = future.result()
                    built_by_id[result_id] = built
                except Exception as exc:
                    logger.warning("[BATCH] chapter %s build failed: %s", ch_id, exc)
                    errors_by_id[ch_id] = str(exc)

        summary: list[dict[str, Any]] = []
        for ch in chapters_to_process:
            ch_id = ch.get("chapter_id", "")
            if ch_id in errors_by_id:
                summary.append({"chapter_id": ch_id, "status": "error", "error": errors_by_id[ch_id]})
                continue
            built = built_by_id.get(ch_id)
            if not built:
                summary.append({"chapter_id": ch_id, "status": "error", "error": "Build result missing"})
                continue
            try:
                script_record, script = self._editable(story_id)
                script.update({k: v for k, v in built.items() if not k.startswith("_")})
                self._save(story_id, script_record, script)
                approve_result = self.approve_script(story_id, chapter_id=ch_id)
                try:
                    candidate = version_service.create_simple_snapshot(story_id)
                    version_id = candidate["version_id"]
                    official = version_service.mark_official(story_id, version_id)
                    approve_result["created_version_id"] = version_id
                    approve_result["version_status"] = official.get("status", "official")
                except Exception as exc:
                    approve_result["version_error"] = str(exc)
                summary.append({
                    "chapter_id": ch_id,
                    "status": "done",
                    "llm_used": built.get("_llm_used", False),
                    "llm_warnings": built.get("_llm_warnings", []),
                    "pages_count": len(built.get("pages", [])),
                    "scenes_used": built.get("_scenes_count", 0),
                    **approve_result,
                })
            except Exception as exc:
                logger.error("[BATCH] chapter %s write/approve failed: %s", ch_id, exc)
                summary.append({"chapter_id": ch_id, "status": "error", "error": str(exc)})

        return {
            "chapters_processed": sum(1 for s in summary if s.get("status") == "done"),
            "chapters_failed": sum(1 for s in summary if s.get("status") == "error"),
            "results": summary,
        }

    # ── unlock helpers ────────────────────────────────────────────────────────

    # (content predicates moved to app/services/content_inspector.py)

    # ── LLM enhancement ───────────────────────────────────────────────────────

    def _enhance_panels_with_llm(
        self,
        *,
        story_id: str,
        script: dict[str, Any],
        chapter: dict[str, Any],
        scenes: list[dict[str, Any]],
        final_text: str,
        plot_threads: dict[str, Any],
        plot_outline: dict[str, Any],
    ) -> tuple[bool, list[str]]:
        """Call LLM to enrich panel visuals/dialogue; merge back into script['pages']."""
        char_rec = self.registry.get_current_file(script.get("story_id", story_id), "characters")
        characters_context: list[dict[str, Any]] = []
        if char_rec:
            json_copy = char_rec.get("json_copy", {})
            for p in (json_copy.get("created_major_character_profiles", []) or [])[:20]:
                name = p.get("character_name", "")
                if name:
                    characters_context.append({
                        "name": name,
                        "role": (p.get("character_role_level", {}) or {}).get("selected", "") if isinstance(p.get("character_role_level"), dict) else "",
                    })
            for p in (json_copy.get("created_side_character_profiles", []) or [])[:20]:
                name = p.get("character_name", "")
                if name:
                    characters_context.append({
                        "name": name,
                        "role": (p.get("character_role_level", {}) or {}).get("selected", "Supporting Character"),
                    })

        try:
            result = self.llm_service.generate_manga_script_panels(  # type: ignore[union-attr]
                story_id=story_id,
                chapter=chapter,
                scenes=scenes,
                final_text=final_text,
                plot_threads=plot_threads,
                characters_context=characters_context,
            )
        except Exception as exc:
            logger.warning("[SCRIPT LLM] panel generation failed: %s", exc)
            return False, [f"LLM panel enhancement failed: {exc}"]

        if result.used_fallback:
            return False, result.warnings

        ai_pages = result.output.get("pages_enhanced", [])
        if not ai_pages:
            return False, result.warnings

        # Merge AI panel content into structural pages by page index.
        for ai_page in ai_pages:
            page_idx = ai_page.get("page_index")
            if not isinstance(page_idx, int) or page_idx >= len(script["pages"]):
                continue
            target_page = script["pages"][page_idx]
            if ai_page.get("page_mood"):
                target_page["page_mood"] = ai_page["page_mood"]
            for ai_panel in ai_page.get("panels", []):
                panel_idx = ai_panel.get("panel_index")
                if not isinstance(panel_idx, int) or panel_idx >= len(target_page["panels"]):
                    continue
                target = target_page["panels"][panel_idx]
                for field in ("visual", "character_action", "background_details", "facial_expression",
                              "pose_or_body_language", "narration", "mood"):
                    if ai_panel.get(field):
                        target[field] = ai_panel[field]
                if ai_panel.get("pacing"):
                    opts = target.get("pacing", {}).get("options", [])
                    if ai_panel["pacing"] in opts:
                        target["pacing"]["selected"] = ai_panel["pacing"]
                if isinstance(ai_panel.get("dialogue"), list):
                    target["dialogue"] = [
                        {
                            "speaker_id": "",
                            "speaker_name": d.get("speaker_name", ""),
                            "text": d.get("text", ""),
                            "speech_bubble_type": {
                                "selected": d.get("speech_bubble_type", "Normal"),
                                "options": ["Normal", "Shout", "Whisper", "Thought", "Narration", "Off-Screen", "Monster / Distorted", "Custom"],
                                "custom_bubble_type": "",
                            },
                        }
                        for d in ai_panel["dialogue"] if isinstance(d, dict)
                    ]
                if isinstance(ai_panel.get("sound_effects"), list):
                    target["sound_effects"] = [
                        {"sfx_text": s.get("sfx_text", ""), "sfx_meaning": s.get("sfx_meaning", ""), "sfx_style_note": ""}
                        for s in ai_panel["sound_effects"] if isinstance(s, dict)
                    ]

        logger.info("[SCRIPT LLM] panel enhancement applied — pages=%d", len(script["pages"]))
        return True, result.warnings

    def patch_script(self, *, story_id: str, target_branch: str, operation: str, value: Any = None) -> dict[str, Any]:
        record, data = self._editable(story_id)
        old_value = self._apply_patch(data, target_branch, operation, value)
        self._save(story_id, record, data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "target_branch": target_branch,
            "operation": operation,
            "old_value": old_value,
            "updated_value": self._get_value(data, target_branch),
            "validation_status": "passed",
        }

    # NOTE(dev): This method writes detected_events_from_script to chapter_script.json but
    # those events are never consumed downstream. EventPatchService.create_from_approved_workspace()
    # and VersionService.create_candidate_from_approved_events() are only called from the
    # plot_workspace/approve route (Writing Desk → Consequence Court pipeline), not from here.
    # The frontend "Extract Events" button has been disabled. Do NOT wire this into
    # EventPatchService directly — it would create duplicate events with the Writing Desk pipeline.
    def extract_events(self, story_id: str, chapter_id: str = "") -> dict[str, Any]:
        record, data = self._editable(story_id)
        self._assert_current_chapter(data, chapter_id=chapter_id, action="extract events")
        script_lines = self._script_text(data)
        full_text = "\n".join(script_lines)

        events = self._keyword_extract_events(full_text)
        llm_used = False
        llm_warnings: list[str] = []

        if self.llm_service and full_text.strip():
            try:
                char_rec = self.registry.get_current_file(story_id, "characters")
                plot_rec = self.registry.get_current_file(story_id, "plot_outline")
                characters_ctx: list[dict[str, Any]] = []
                if char_rec:
                    for p in char_rec.get("json_copy", {}).get("created_major_character_profiles", [])[:8]:
                        characters_ctx.append({"name": p.get("character_name", "")})
                threads_ctx: dict[str, Any] = {}
                if plot_rec:
                    pt = plot_rec.get("json_copy", {}).get("plot_threads", {}) or {}
                    threads_ctx = {
                        "main_goal": str(pt.get("main_plot_thread", {}).get("goal", ""))[:160],
                        "threats": [
                            t.get("threat_id_or_name", "")
                            for t in pt.get("threat_threads", [])[:3]
                            if isinstance(t, dict)
                        ],
                    }
                result = self.llm_service.extract_script_events(
                    story_id=story_id,
                    chapter_id=data.get("chapter_metadata", {}).get("chapter_id", ""),
                    script_text=full_text,
                    context={"characters": characters_ctx, "plot_threads_summary": threads_ctx},
                )
                if not result.used_fallback:
                    ai_events = [e for e in result.output.get("detected_events_from_script", []) if isinstance(e, dict)]
                    if ai_events:
                        events = ai_events
                        llm_used = True
                llm_warnings = result.warnings
            except Exception as exc:
                logger.warning("[SCRIPT EVENTS] LLM extraction failed: %s", exc)
                llm_warnings = [f"LLM event extraction failed: {exc}"]

        data.setdefault("chapter_event_extraction", {})["status"] = "completed"
        data["chapter_event_extraction"]["detected_events_from_script"] = events
        # Advance lifecycle once script is approved AND events have been extracted.
        if data.get("approval", {}).get("script_approved_by_user"):
            data.setdefault("chapter_metadata", {})["chapter_status"] = "events_extracted"
        self._save(story_id, record, data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "detected_events_from_script": events,
            "requires_review": bool(events),
            "llm_used": llm_used,
            "llm_warnings": llm_warnings,
            "chapter_status": data.get("chapter_metadata", {}).get("chapter_status", "draft"),
            "validation_status": "passed",
        }

    def _keyword_extract_events(self, full_text: str) -> list[dict[str, Any]]:
        text = full_text.lower()
        events: list[dict[str, Any]] = []
        if "injur" in text or "wound" in text:
            events.append({"event_type": "CHARACTER_INJURED", "confidence": "medium", "evidence": "script contains injury/wound language"})
        if "spy" in text or "betray" in text:
            events.append({"event_type": "CHARACTER_ALLEGIANCE_CHANGED_OR_REVEALED", "confidence": "medium", "evidence": "script contains spy/betray language"})
        if "fight" in text or "attack" in text:
            events.append({"event_type": "CHARACTER_ATTACKED_CHARACTER", "confidence": "medium", "evidence": "script contains fight/attack language"})
        if "die" in text or "killed" in text or "death" in text:
            events.append({"event_type": "CHARACTER_DIED", "confidence": "medium", "evidence": "script contains death language"})
        if "destroy" in text or "ruined" in text:
            events.append({"event_type": "LOCATION_DESTROYED", "confidence": "low", "evidence": "script contains destruction language"})
        return events

    def approve_script(self, story_id: str, chapter_id: str = "") -> dict[str, Any]:
        record, data = self._editable(story_id)
        self._assert_current_chapter(data, chapter_id=chapter_id, action="approve")
        if not script_has_meaningful_pages(data):
            raise MangaMakerError(
                "NO_SCRIPT_PAGES",
                "Generate script pages before approving the chapter script.",
                status_code=400,
            )
        approval = data.setdefault("approval", {})
        approval["script_approved_by_user"] = True
        approval["approved_at"] = datetime.now(timezone.utc).isoformat()
        approval["ready_for_memory_update"] = True
        # If events were already extracted before approval, jump straight to events_extracted.
        already_extracted = data.get("chapter_event_extraction", {}).get("status") == "completed"
        data.setdefault("chapter_metadata", {})["chapter_status"] = "events_extracted" if already_extracted else "approved"
        data["chapter_metadata"]["approved_as_official"] = True
        self._save(story_id, record, data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "script_approved_by_user": True,
            "ready_for_memory_update": True,
            "chapter_status": data["chapter_metadata"]["chapter_status"],
            "validation_status": "passed",
        }

    def mark_completed(self, story_id: str, *, next_version_id: str) -> dict[str, Any]:
        """Mark the chapter script as fully integrated into a new version bundle.

        Called by VersionService after a candidate version is created from the
        approved events that originated in this chapter's workspace flow.
        """
        record, data = self._editable(story_id)
        data.setdefault("memory_update_plan_after_chapter", {})["next_version_id"] = next_version_id
        data.setdefault("chapter_metadata", {})["chapter_status"] = "completed"
        self._save(story_id, record, data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "next_version_id": next_version_id,
            "chapter_status": "completed",
            "validation_status": "passed",
        }

    def _get_record(self, story_id: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, "chapter_script")
        if not record:
            raise MangaMakerError("CHAPTER_SCRIPT_NOT_FOUND", f"chapter_script.json not found for story {story_id}", status_code=404)
        return record

    def _editable(self, story_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        record = self._get_record(story_id)
        return record, copy.deepcopy(record["json_copy"])

    def _assert_current_chapter(self, data: dict[str, Any], *, chapter_id: str, action: str) -> None:
        if not chapter_id:
            return
        current_id = (data.get("chapter_metadata") or {}).get("chapter_id", "")
        if chapter_id == current_id:
            return
        message_current = current_id or "none"
        raise MangaMakerError(
            "SCRIPT_CHAPTER_MISMATCH",
            f"Selected chapter {chapter_id} is not the current generated script ({message_current}). "
            f"Generate that chapter first, or select {message_current}, before using {action}.",
            details={"selected_chapter_id": chapter_id, "current_chapter_id": current_id, "action": action},
            status_code=409,
        )

    def _current_file(self, story_id: str, file_type: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, file_type)
        if not record:
            raise MangaMakerError("FILE_NOT_FOUND", f"{file_type} not found for story {story_id}", status_code=404)
        return record

    def _save(self, story_id: str, record: dict[str, Any], data: dict[str, Any]) -> None:
        self._validate_runtime(data, story_id=story_id, version_id=record["version_id"])
        checksum = self.snapshot_service.write_existing_json(path=record["storage_path"], data=data)
        self.registry.update_file_json_copy(story_id=story_id, version_id=record["version_id"], file_type="chapter_script", json_copy=data, checksum=checksum, now=datetime.now(timezone.utc).isoformat())

    def _validate_runtime(self, data: dict[str, Any], *, story_id: str, version_id: str) -> None:
        if data.get("story_id") != story_id:
            raise MangaMakerError("VALIDATION_ERROR", "chapter_script story_id mismatch")
        if data.get("version_id") != version_id:
            raise MangaMakerError("VALIDATION_ERROR", "chapter_script version_id mismatch")
        if data.get("file_type") != "chapter_script":
            raise MangaMakerError("VALIDATION_ERROR", "file_type must be chapter_script")
        linked = data.get("linked_files", {})
        for key, value in {"master_story_file":"master_story.json", "characters_file":"characters.json", "plot_outline_file":"plot_outline.json", "plot_workspace_file":"plot_workspace.json", "memory_system_file":"memory_system.json"}.items():
            if linked.get(key) != value:
                raise MangaMakerError("FILENAME_ERROR", f"chapter_script linked_files.{key} must be {value}")
        fmt = data.get("script_format", {})
        if fmt.get("format_type") != "manga_script":
            raise MangaMakerError("VALIDATION_ERROR", "chapter_script script_format.format_type must be manga_script")
        if not isinstance(data.get("pages", []), list):
            raise MangaMakerError("VALIDATION_ERROR", "chapter_script pages must be a list")

    def _response(self, record: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
        return {"story_id": data.get("story_id"), "version_id": record["version_id"], "file_type": "chapter_script", "state_type": data.get("state_type", "template_state"), "script_id": data.get("script_id", "script_ch_001"), "chapter_status": data.get("chapter_metadata", {}).get("chapter_status", "draft"), "content": data}

    def _find_chapter(self, plot_outline: dict[str, Any], chapter_id: str = "") -> dict[str, Any]:
        chapters = plot_outline.get("chapter_or_episode_list", {}).get("chapters", [])
        if chapter_id:
            for ch in chapters:
                if ch.get("chapter_id") == chapter_id:
                    return ch
            raise MangaMakerError("CHAPTER_NOT_FOUND", f"Chapter {chapter_id!r} not found in plot outline", status_code=404)
        for chapter in chapters:
            if isinstance(chapter, dict) and chapter_has_content(chapter):
                return chapter
        return {}

    def _find_scenes_for_chapter(self, plot_outline: dict[str, Any], chapter_id: str) -> list[dict[str, Any]]:
        """Return all scene cards for the chapter, ordered by scene_order."""
        scenes = plot_outline.get("scene_cards", {}).get("scenes", [])
        if chapter_id:
            ch_scenes = [
                s for s in scenes
                if isinstance(s, dict) and s.get("chapter_id") == chapter_id and scene_has_content(s)
            ]
            return sorted(ch_scenes, key=lambda s: s.get("scene_order", 0)) if ch_scenes else []
        return meaningful_scenes(scenes)[:1] if scenes else []

    def _find_scene_for_chapter(self, plot_outline: dict[str, Any], chapter_id: str) -> dict[str, Any]:
        result = self._find_scenes_for_chapter(plot_outline, chapter_id)
        return result[0] if result else {}

    def _panel(self, panel_id: str, number: int, shot: str, visual: str, action: str, dialogue: str) -> dict[str, Any]:
        return {
            "panel_id": panel_id,
            "panel_number": number,
            "panel_size": {"selected": "Medium", "options": ["Small","Medium","Large","Full-Width","Splash Panel","Double-Page Spread","Custom"], "custom_panel_size": ""},
            "camera_shot": {"selected": shot, "options": ["Close-Up","Extreme Close-Up","Medium Shot","Wide Shot","Over-The-Shoulder","Low Angle","High Angle","Bird's-Eye View","Worm's-Eye View","Action Shot","Reaction Shot","Establishing Shot","Custom"], "custom_camera_shot": ""},
            "visual": visual,
            "character_action": action,
            "background_details": "",
            "facial_expression": "",
            "pose_or_body_language": "",
            "dialogue": [],
            "narration": dialogue,
            "sound_effects": [],
            "mood": "",
            "pacing": {"selected": "Normal", "options": ["Fast","Normal","Slow","Dramatic Pause","Comedic Timing","Action Burst","Custom"], "custom_pacing": ""},
            "continuity_notes": "",
            "custom_panel_details": "",
        }

    def _script_text(self, data: dict[str, Any]) -> list[str]:
        texts = []
        for page in data.get("pages", []):
            for panel in page.get("panels", []):
                texts.append(panel.get("visual", ""))
                texts.append(panel.get("character_action", ""))
                texts.append(panel.get("narration", ""))
                for line in panel.get("dialogue", []):
                    texts.append(line.get("text", ""))
        return texts

    def _apply_patch(self, data: dict[str, Any], branch: str, op: str, value: Any) -> Any:
        parent, key = self._resolve_parent(data, branch, create=op in {"add", "merge_object", "append_to_array"})
        old = None
        if isinstance(parent, list):
            if not isinstance(key, int):
                raise MangaMakerError("PATCH_TYPE_ERROR", "List parent requires numeric index")
            if key >= len(parent):
                if op == "add":
                    parent.append(value); return None
                raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Index out of range: {branch}")
            old = copy.deepcopy(parent[key])
            if op == "replace": parent[key] = value
            elif op == "remove": parent.pop(key)
            elif op == "merge_object":
                if not isinstance(parent[key], dict) or not isinstance(value, dict): raise MangaMakerError("PATCH_TYPE_ERROR", "merge_object requires object")
                parent[key].update(value)
            elif op == "add": parent.insert(key, value)
            else: raise MangaMakerError("UNSUPPORTED_PATCH_OPERATION", op)
        else:
            old = copy.deepcopy(parent.get(key))
            if op == "replace":
                if key not in parent: raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Path not found: {branch}")
                parent[key] = value
            elif op == "add": parent[key] = value
            elif op == "remove": parent.pop(key, None)
            elif op == "merge_object":
                if key not in parent or parent[key] is None: parent[key] = {}
                if not isinstance(parent[key], dict) or not isinstance(value, dict): raise MangaMakerError("PATCH_TYPE_ERROR", "merge_object requires object")
                parent[key].update(value)
            elif op == "append_to_array":
                if key not in parent or parent[key] is None: parent[key] = []
                if not isinstance(parent[key], list): raise MangaMakerError("PATCH_TYPE_ERROR", "append_to_array requires list")
                parent[key].append(value)
            else: raise MangaMakerError("UNSUPPORTED_PATCH_OPERATION", op)
        return old

    def _resolve_parent(self, data: dict[str, Any], branch: str, create: bool = False) -> tuple[Any, str | int]:
        tokens = self._tokens(branch)
        cur: Any = data
        for token in tokens[:-1]:
            if isinstance(token, int):
                if not isinstance(cur, list) or token >= len(cur): raise MangaMakerError("PATCH_PATH_NOT_FOUND", branch)
                cur = cur[token]
            else:
                if token not in cur:
                    if create: cur[token] = {}
                    else: raise MangaMakerError("PATCH_PATH_NOT_FOUND", branch)
                cur = cur[token]
        return cur, tokens[-1]

    def _get_value(self, data: dict[str, Any], branch: str) -> Any:
        cur: Any = data
        for token in self._tokens(branch):
            cur = cur[token] if isinstance(token, int) else cur.get(token)
        return cur

    def _tokens(self, branch: str) -> list[str | int]:
        parts: list[str | int] = []
        for raw in branch.replace("]", "").replace("[", ".").split("."):
            if raw == "": continue
            parts.append(int(raw) if raw.isdigit() else raw)
        return parts
