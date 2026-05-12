"""Canonical context pack — the single source of truth for LLM context.

Every AI call in the system should call build() to get the full story
context. The pack always includes:
  - master_story (world, factions including faction_visual_signatures, threats)
  - characters (profiles + relationship map)
  - plot_outline (arc, chapters, scenes, plot_threads, locations)
  - optional: plot_workspace, current chapter_script

The pack is designed to be passed directly to llm_service.generate_fields
as the `context` argument (no further compaction needed for field generation).
Heavy generation (e.g. panel scripts) may still compact internally.
"""
from __future__ import annotations

from typing import Any

from app.repositories.sqlite_registry import SQLiteRegistry


class ContextPackService:
    """Build the canonical full-context pack for any story."""

    def __init__(self, *, registry: SQLiteRegistry):
        self.registry = registry

    # ─── helpers ────────────────────────────────────────────────────────

    def _load(self, story_id: str, file_type: str) -> dict:
        rec = self.registry.get_current_file(story_id, file_type)
        return (rec.get("json_copy") or {}) if rec else {}

    @staticmethod
    def _char_summary(profile: dict) -> dict:
        """Compact but complete character summary for LLM context."""
        appearance = (profile.get("appearance_and_visual_design") or {}).get("appearance_details", {}) or {}
        backstory_block = profile.get("character_backstory_mental_state_and_community_place") or {}
        backstory = (backstory_block.get("backstory_details") or {}) if isinstance(backstory_block, dict) else {}
        personality = (profile.get("character_personality") or {}).get("personality_details", {}) or {}
        arc = (profile.get("character_arc_and_threat_connection") or {}).get("arc_details", {}) or {}
        powers_block = profile.get("optional_powers_and_power_level") or {}
        powers = (powers_block.get("power_details") or {}) if isinstance(powers_block, dict) and powers_block.get("is_enabled") else {}

        return {
            "id": profile.get("profile_id", ""),
            "name": profile.get("character_name", ""),
            "role": (profile.get("character_role_level") or {}).get("selected", ""),
            "faction": (profile.get("main_character_faction_alignment") or {}).get("selected", ""),
            "appearance": {
                "age": appearance.get("age_range", ""),
                "gender": appearance.get("gender_presentation", ""),
                "hair": appearance.get("hair_color", ""),
                "eyes": appearance.get("eye_color", ""),
                "outfit": appearance.get("main_outfit_description", ""),
                "positive_prompt": appearance.get("ai_image_prompt_notes", ""),
                "negative_prompt": appearance.get("negative_prompt_notes", ""),
            },
            "backstory_summary": backstory.get("childhood_summary", "") or backstory.get("important_past_event", ""),
            "traits": personality.get("core_traits", [])[:6],
            "arc_start": arc.get("starting_belief", ""),
            "arc_end": arc.get("final_state", ""),
            "power": powers.get("power_name", ""),
        }

    # ─── public API ─────────────────────────────────────────────────────

    def build(
        self,
        story_id: str,
        *,
        include_workspace: bool = False,
        include_chapter_script: bool = False,
        chapter_id_hint: str | None = None,
    ) -> dict[str, Any]:
        """Return the full context pack for the given story."""
        ms = self._load(story_id, "master_story")
        chars = self._load(story_id, "characters")
        po = self._load(story_id, "plot_outline")

        major_profiles = chars.get("created_major_character_profiles", []) or []
        side_profiles = chars.get("created_side_character_profiles", []) or []
        relationships = (chars.get("character_relationship_map") or {}).get("relationships", []) or []

        locations_block = po.get("locations") or {}
        locations = locations_block.get("locations", []) if isinstance(locations_block, dict) else []

        faction_vis = (ms.get("faction_visual_signatures") or {}).get("signatures", []) or []
        factions_block = ms.get("major_factions_and_ruling_sides") or {}
        threats_block = ms.get("major_threats_and_minor_side_threats") or {}

        arc_overview = po.get("story_arc_overview") or {}
        chapters = (po.get("chapter_or_episode_list") or {}).get("chapters", []) or []
        scenes = (po.get("scene_cards") or {}).get("scenes", []) or []
        plot_threads = po.get("plot_threads") or {}
        narrative_structure = (po.get("narrative_structure") or {}).get("selected", "")

        pack: dict[str, Any] = {
            "story_id": story_id,
            "master_story": {
                "title": ms.get("title") or ms.get("story_title", ""),
                "idea_so_far": ms.get("idea_so_far", ""),
                "story_type": (ms.get("story_type") or {}).get("selected", []),
                "world_type": (ms.get("world_type") or {}).get("selected", ""),
                "world_rules": ms.get("world_master_rules", {}),
                "factions": factions_block,
                "faction_visual_signatures": faction_vis,
                "threats": threats_block,
                "ending_direction": (ms.get("ending_direction") or {}).get("selected", ""),
            },
            "characters": {
                "major": [self._char_summary(p) for p in major_profiles],
                "side": [{"id": p.get("profile_id", ""), "name": p.get("character_name", "")} for p in side_profiles],
                "relationships": [
                    {
                        "id": r.get("relationship_id", ""),
                        "pair": r.get("characters_involved", ""),
                        "type": r.get("relationship_change_type", ""),
                        "description": r.get("reason", ""),
                    }
                    for r in relationships if isinstance(r, dict)
                ],
                # Name→ID lookup to help resolvers
                "_name_to_id": {
                    p.get("character_name", "").lower(): p.get("profile_id", "")
                    for p in major_profiles
                    if p.get("character_name")
                },
                "_id_to_name": {
                    p.get("profile_id", ""): p.get("character_name", "")
                    for p in major_profiles
                    if p.get("profile_id")
                },
            },
            "plot_outline": {
                "narrative_structure": narrative_structure,
                "arc": arc_overview,
                "chapters": chapters,
                "scenes": scenes,
                "plot_threads": plot_threads,
            },
            "locations": locations,
        }

        if include_workspace:
            ws = self._load(story_id, "plot_workspace")
            pack["plot_workspace"] = ws

        if include_chapter_script:
            cs = self._load(story_id, "chapter_script")
            # If chapter_id_hint provided, verify it matches; otherwise return current
            if chapter_id_hint:
                meta = (cs.get("chapter_metadata") or {})
                if meta.get("chapter_id") != chapter_id_hint:
                    cs = {}
            pack["chapter_script"] = cs

        return pack

    def build_for_panel_generation(
        self,
        story_id: str,
        *,
        chapter_id: str,
    ) -> dict[str, Any]:
        """Extended pack used when generating panel scripts — includes adjacent chapter context."""
        pack = self.build(story_id, include_chapter_script=True, chapter_id_hint=chapter_id)

        # Attach location lookup by id for panel generation
        pack["_location_by_id"] = {
            loc.get("location_id", ""): loc
            for loc in pack.get("locations", [])
            if isinstance(loc, dict) and loc.get("location_id")
        }

        return pack
