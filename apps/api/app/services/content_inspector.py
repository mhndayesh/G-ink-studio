from __future__ import annotations

"""Shared "does this story object have meaningful content?" predicates.

Both ``StoryService`` (phase-status computation) and ``ChapterScriptService``
(unlock gating, script generation) need the same notion of "is this chapter /
scene / page non-empty". The logic used to be copy-pasted into both classes;
it lives here now so it can't drift.

Pure functions, no I/O, no state.
"""

from typing import Any

# Field names that make a chapter / scene "have content" — kept in one place so
# the studio's gates and the generator agree on what "empty" means.
_CHAPTER_CONTENT_FIELDS = (
    "chapter_title", "chapter_purpose", "summary", "main_conflict",
    "emotional_beat", "twist_or_hook", "ending_cliffhanger", "custom_chapter_details",
)
_SCENE_CONTENT_FIELDS = (
    "location", "time", "characters_present", "scene_goal", "scene_conflict",
    "relationship_dynamic_used", "new_information_revealed", "action_or_dialogue_focus",
    "visual_manga_moment", "panel_mood", "ending_beat", "custom_scene_details",
)
_PANEL_CONTENT_FIELDS = (
    "visual", "character_action", "background_details", "facial_expression",
    "pose_or_body_language", "narration", "mood", "continuity_notes", "custom_panel_details",
)


def has_content(value: Any) -> bool:
    """True if ``value`` carries any non-empty user content.

    Strings: non-blank. Lists: any element has content. Dicts: a non-"options"
    value has content (and a selection object's ``selected`` counts). Scalars:
    not ``None`` and not ``False``.
    """
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(has_content(item) for item in value)
    if isinstance(value, dict):
        if "selected" in value and has_content(value.get("selected")):
            return True
        return any(has_content(v) for k, v in value.items() if k not in {"options"})
    return value is not None and value is not False


def chapter_has_content(chapter: dict[str, Any]) -> bool:
    return any(has_content(chapter.get(field)) for field in _CHAPTER_CONTENT_FIELDS)


def scene_has_content(scene: dict[str, Any]) -> bool:
    return any(has_content(scene.get(field)) for field in _SCENE_CONTENT_FIELDS)


def meaningful_chapters(chapters: list[Any]) -> list[dict[str, Any]]:
    return [c for c in chapters if isinstance(c, dict) and chapter_has_content(c)]


def meaningful_scenes(scenes: list[Any]) -> list[dict[str, Any]]:
    return [s for s in scenes if isinstance(s, dict) and scene_has_content(s)]


def page_has_content(page: dict[str, Any]) -> bool:
    if has_content(page.get("page_purpose")) or has_content(page.get("page_mood")):
        return True
    for panel in page.get("panels", []) or []:
        if not isinstance(panel, dict):
            continue
        if any(has_content(panel.get(field)) for field in _PANEL_CONTENT_FIELDS):
            return True
        for line in panel.get("dialogue", []) or []:
            if isinstance(line, dict) and has_content(line.get("text")):
                return True
        for sfx in panel.get("sound_effects", []) or []:
            if isinstance(sfx, dict) and (
                has_content(sfx.get("sfx_text"))
                or has_content(sfx.get("sfx_meaning"))
                or has_content(sfx.get("sfx_style_note"))
            ):
                return True
    return False


def meaningful_page_count(script_data: dict[str, Any]) -> int:
    return sum(
        1 for page in (script_data.get("pages", []) or [])
        if isinstance(page, dict) and page_has_content(page)
    )


def script_has_meaningful_pages(script_data: dict[str, Any]) -> bool:
    return meaningful_page_count(script_data) > 0


def plot_threads_have_content(plot_threads: dict[str, Any]) -> bool:
    """True if at least one plot thread (main, character-arc, relationship, threat, power) has content."""
    if not isinstance(plot_threads, dict):
        return False
    main = plot_threads.get("main_plot_thread", {})
    if isinstance(main, dict) and str(main.get("goal", "")).strip():
        return True
    for key in ("character_arc_threads", "relationship_threads", "threat_threads", "power_threads"):
        items = plot_threads.get(key, [])
        if not isinstance(items, list):
            continue
        for item in items:
            if isinstance(item, dict) and any(str(v).strip() for v in item.values() if isinstance(v, str)):
                return True
    return False
