from __future__ import annotations

"""Building the trimmed story-context payload sent to the LLM.

``compact_generation_context()`` reduces the full story files to a small,
length-capped dict tailored to each generation `page`, so prompts stay fast.
``clip_text()`` is the recursive string/list/dict truncator it uses. Pure —
no I/O, no app state. Extracted from llm_service.py.
"""

from typing import Any


def clip_text(value: Any, limit: int = 600) -> Any:
    if isinstance(value, str):
        text = value.strip()
        return text[:limit] + ("..." if len(text) > limit else "")
    if isinstance(value, list):
        return [clip_text(item, limit) for item in value[:12]]
    if isinstance(value, dict):
        return {k: clip_text(v, limit) for k, v in value.items()}
    return value

def compact_generation_context(
    *,
    page: str,
    context: dict[str, Any],
    generation_hints: dict[str, Any] | None,
) -> dict[str, Any]:
    ms = context.get("master_story", {}) or {}
    chars = context.get("characters", {}) or {}
    plot = context.get("plot_outline", {}) or {}
    workspace = context.get("plot_workspace", {}) or {}

    major_profiles = chars.get("created_major_character_profiles", []) or []
    side_profiles = chars.get("created_side_character_profiles", []) or []
    # For auto side cast generation, send major character names only — no role/faction/arc —
    # to prevent weak models from copying major character details into the generated side profiles.
    _auto_generate = page == "side" and bool((generation_hints or {}).get("auto_generate"))
    if _auto_generate:
        character_refs = [{"id": p.get("profile_id", ""), "name": p.get("character_name", "")} for p in major_profiles[:20]]
    else:
        character_refs = [
            {
                "id": p.get("profile_id", ""),
                "name": p.get("character_name", ""),
                "role": clip_text(p.get("character_role_level", ""), 120),
                "faction": clip_text(p.get("main_character_faction_alignment", ""), 180),
                "arc": clip_text(p.get("character_arc_and_threat_connection", p.get("arc", "")), 240),
            }
            for p in major_profiles[:20]
        ]
    side_refs = [{"id": p.get("profile_id", ""), "name": p.get("character_name", "")} for p in side_profiles[:20]]

    chapters = plot.get("chapter_or_episode_list", {}).get("chapters", []) or []
    chapter_refs = [
        {
            "chapter_id": ch.get("chapter_id", ""),
            "chapter_number": ch.get("chapter_number", 0),
            "chapter_title": ch.get("chapter_title", ""),
            "structure_section": ch.get("structure_section", ""),
            "summary": clip_text(ch.get("summary", ""), 500),
            "main_conflict": clip_text(ch.get("main_conflict", ""), 240),
            "emotional_beat": clip_text(ch.get("emotional_beat", ""), 200),
            "twist_or_hook": clip_text(ch.get("twist_or_hook", ""), 200),
            "ending_cliffhanger": clip_text(ch.get("ending_cliffhanger", ""), 220),
            "characters_present": ch.get("characters_present", []),
        }
        for ch in chapters[-24:]
    ]

    target_ids = (generation_hints or {}).get("chapter_ids", [])
    if page == "scenes" and target_ids:
        chapter_refs = [ch for ch in chapter_refs if ch.get("chapter_id") in target_ids]

    if page == "threads":
        return {
            "story": {
                "idea": clip_text(ms.get("idea_so_far", ""), 280),
                "threats": {
                    "major": clip_text((ms.get("major_threats_and_minor_side_threats", {}) or {}).get("major_threat", ""), 160),
                    "minor": clip_text((ms.get("major_threats_and_minor_side_threats", {}) or {}).get("minor_side_threats", []), 80),
                },
                "factions": clip_text((ms.get("major_factions_and_ruling_sides", {}) or {}).get("selected", []), 80),
            },
            "characters": {
                "major": [{"id": p.get("profile_id", ""), "name": p.get("character_name", "")} for p in major_profiles[:12]],
                "relationships": [
                    {
                        "id": r.get("relationship_id", "") or stable_rel_id_from_pair(r.get("characters_involved", "")),
                        "characters": clip_text(r.get("characters_involved", ""), 80),
                        "type": clip_text(r.get("relationship_change_type", ""), 80),
                    }
                    for r in (chars.get("character_relationship_map", {}).get("relationships", []) or [])[:8]
                    if isinstance(r, dict)
                ],
            },
            "arc": clip_text({
                "title": (plot.get("story_arc_overview", {}) or {}).get("arc_title", ""),
                "summary": (plot.get("story_arc_overview", {}) or {}).get("arc_summary", ""),
                "external_conflict": (plot.get("story_arc_overview", {}) or {}).get("main_external_conflict", ""),
                "internal_conflict": (plot.get("story_arc_overview", {}) or {}).get("main_internal_conflict", ""),
                "story_question": (plot.get("story_arc_overview", {}) or {}).get("main_story_question", ""),
            }, 360),
            "chapters": [
                {
                    "id": ch.get("chapter_id", ""),
                    "n": ch.get("chapter_number", 0),
                    "title": ch.get("chapter_title", ""),
                    "section": ch.get("structure_section", ""),
                    "summary": clip_text(ch.get("summary", ""), 180),
                    "conflict": clip_text(ch.get("main_conflict", ""), 100),
                    "hook": clip_text(ch.get("ending_cliffhanger", "") or ch.get("twist_or_hook", ""), 100),
                }
                for ch in chapters[-12:]
            ],
            "existing_threads": clip_text(plot.get("plot_threads", {}), 160),
        }

    # Locations from plot_outline
    locations_block = plot.get("locations") or {}
    locations_list = locations_block.get("locations", []) if isinstance(locations_block, dict) else []
    location_refs = [
        {
            "location_id": loc.get("location_id", ""),
            "name": loc.get("name", ""),
            "type": loc.get("type", ""),
            "description": clip_text(loc.get("description", ""), 200),
            "positive_prompt": clip_text(loc.get("positive_prompt", ""), 300),
            "negative_prompt": clip_text(loc.get("negative_prompt", ""), 150),
        }
        for loc in locations_list if isinstance(loc, dict)
    ]

    # Faction visuals from master_story
    faction_vis_block = ms.get("faction_visual_signatures") or {}
    faction_vis_list = faction_vis_block.get("signatures", []) if isinstance(faction_vis_block, dict) else []

    compact = {
        "master_story": {
            "idea_so_far": clip_text(ms.get("idea_so_far", ""), 500),
            "story_type": clip_text(ms.get("story_type", {}), 180),
            "world_type": clip_text(ms.get("world_type", {}), 180),
            "world_rules": clip_text(ms.get("world_master_rules", {}), 500),
            "factions": clip_text(ms.get("major_factions_and_ruling_sides", {}), 500),
            "faction_visual_signatures": clip_text(faction_vis_list, 400),
            "threats": clip_text(ms.get("major_threats_and_minor_side_threats", {}), 500),
        },
        "characters": {
            "major": character_refs,
            "side": side_refs,
            "relationships": clip_text(chars.get("character_relationship_map", {}).get("relationships", []), 300),
        },
        "plot_outline": {
            "narrative_structure": plot.get("narrative_structure", {}),
            "story_arc_overview": clip_text(plot.get("story_arc_overview", {}), 700),
            "structure_editors": clip_text({
                "kishotenketsu_outline": plot.get("kishotenketsu_outline", {}),
                "conflict_driven_outline": plot.get("conflict_driven_outline", {}),
            }, 400),
            "chapters": chapter_refs,
            "scene_counts": {
                ch.get("chapter_id"): len([
                    s for s in (plot.get("scene_cards", {}).get("scenes", []) or [])
                    if isinstance(s, dict) and s.get("chapter_id") == ch.get("chapter_id")
                ])
                for ch in chapter_refs
            },
            "plot_threads": clip_text(plot.get("plot_threads", {}), 500),
        },
        "locations": location_refs,
    }

    if page == "court":
        compact["plot_workspace"] = {
            "user_free_writing": clip_text(workspace.get("user_free_writing", {}), 900),
            "consequence_questions": clip_text(workspace.get("consequence_questions", []), 700),
        }
    return compact

