from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_llm_service, get_registry, get_character_service
from app.models.api import AiGenerateRequest
from app.services.llm_service import LLMService
from app.services.character_service import CharacterService
from app.repositories.sqlite_registry import SQLiteRegistry

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/ai", tags=["ai"])


@router.post("/generate")
def ai_generate(
    story_id: str,
    request: AiGenerateRequest,
    llm: LLMService = Depends(get_llm_service),
    registry: SQLiteRegistry = Depends(get_registry),
):
    context: dict = {}
    for file_type in ["master_story", "characters", "plot_outline", "plot_workspace", "chapter_script"]:
        rec = registry.get_current_file(story_id, file_type)
        if rec:
            context[file_type] = rec.get("json_copy", {})

    user_constraints = {}
    ws = context.get("plot_workspace", {})
    fw = ws.get("user_free_writing", {})
    if fw.get("user_intent_notes"):
        user_constraints["user_intent_notes"] = fw["user_intent_notes"]
    if fw.get("do_not_change_these_parts"):
        user_constraints["do_not_change_these_parts"] = fw["do_not_change_these_parts"]
    if fw.get("user_priority"):
        user_constraints["user_priority"] = fw["user_priority"]

    result = llm.generate_fields(
        story_id=story_id,
        page=request.page,
        target_fields=request.target_fields,
        partial_input=request.partial_input,
        context=context,
        user_constraints=user_constraints,
        generation_hints=request.generation_hints,
    )
    return ok(result)


@router.get("/references")
def get_references(story_id: str, registry: SQLiteRegistry = Depends(get_registry)):
    """Return cross-page reference data: character names, faction names, threat names, chapter IDs."""
    import re as _re

    def _slug(value: str) -> str:
        return _re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")

    def _stable_rel_id(from_name: str, to_name: str) -> str:
        a, b = _slug(from_name), _slug(to_name)
        if not a or not b:
            return ""
        return f"rel_{a}__{b}"

    refs: dict = {"characters": [], "factions": [], "threats": [], "chapters": [], "relationships": []}

    # Characters
    char_rec = registry.get_current_file(story_id, "characters")
    if char_rec:
        char_data = char_rec.get("json_copy", {})
        for p in char_data.get("created_major_character_profiles", []):
            refs["characters"].append({"id": p.get("profile_id", ""), "name": p.get("character_name", ""), "label": p.get("profile_label", "")})
        # Relationship objects are stored as { characters_involved: "A / B",
        # relationship_change_type: "..." } by character_service.apply_relationship_updates.
        # Surface them in the dropdown-friendly { from, to, type } shape, dropping
        # any entry that can't be parsed into a clean pair. The id is derived
        # deterministically from the (from, to) slug so it stays stable across
        # reorders and re-saves — that's what plot_threads.relationship_threads
        # references downstream.
        for r in char_data.get("character_relationship_map", {}).get("relationships", []):
            involved = (r.get("characters_involved") or "").strip()
            parts = [p.strip() for p in involved.split("/") if p.strip()] if involved else []
            if len(parts) < 2:
                continue
            rel_type = r.get("relationship_change_type") or r.get("relationship_type") or ""
            stored_id = (r.get("relationship_id") or "").strip()
            stable_id = _stable_rel_id(parts[0], parts[1])
            refs["relationships"].append({
                "id": stored_id or stable_id or f"rel_{len(refs['relationships'])}",
                "from": parts[0],
                "to": parts[1],
                "type": rel_type,
            })

    # Factions & Threats from master_story
    ms_rec = registry.get_current_file(story_id, "master_story")
    if ms_rec:
        ms_data = ms_rec.get("json_copy", {})
        factions = ms_data.get("major_factions_and_ruling_sides", {})
        faction_selected = factions.get("selected", [])
        if faction_selected:
            refs["factions"] = [s for s in faction_selected if s != "Custom"]
        threats_block = ms_data.get("major_threats_and_minor_side_threats", {})
        threat = threats_block.get("major_threat", "")
        if threat and threat != "Custom":
            refs["threats"].append(threat)
        minor = threats_block.get("minor_side_threats", [])
        refs["threats"].extend([t for t in minor if t != "Custom"])

    # Chapters
    po_rec = registry.get_current_file(story_id, "plot_outline")
    if po_rec:
        po_data = po_rec.get("json_copy", {})
        for ch in po_data.get("chapter_or_episode_list", {}).get("chapters", []):
            refs["chapters"].append({"id": ch.get("chapter_id", ""), "number": ch.get("chapter_number", 0), "title": ch.get("chapter_title", "")})

    return ok(refs)


# Map a narrative_structure choice → the sections it requires + the keywords
# that match a chapter's free-text `structure_section` field. Match is
# case-insensitive substring on any keyword.
_ARC_STRUCTURE_SECTIONS: dict[str, list[tuple[str, str, list[str]]]] = {
    "Kishotenketsu": [
        ("ki", "Ki — Introduction", ["ki", "introduction"]),
        ("sho", "Sho — Development", ["sho", "development"]),
        ("ten", "Ten — Twist / Turn", ["ten", "twist", "turn"]),
        ("ketsu", "Ketsu — Conclusion", ["ketsu", "conclusion", "resolution"]),
    ],
    "Three-Act Structure": [
        ("act_1", "Act 1 — Setup", ["act 1", "act_1", "act1", "setup"]),
        ("act_2", "Act 2 — Escalation", ["act 2", "act_2", "act2", "escalation", "midpoint", "rising"]),
        ("act_3", "Act 3 — Climax & Resolution", ["act 3", "act_3", "act3", "climax", "resolution", "finale"]),
    ],
    "Hero's Journey": [
        ("act_1", "Departure / Setup", ["act 1", "act_1", "act1", "departure", "setup", "ordinary world", "call"]),
        ("act_2", "Initiation / Ordeal", ["act 2", "act_2", "act2", "initiation", "ordeal", "trial", "midpoint"]),
        ("act_3", "Return / Resolution", ["act 3", "act_3", "act3", "return", "climax", "resolution"]),
    ],
    "Mystery Arc": [
        ("mystery_setup", "Mystery Setup", ["mystery setup", "setup", "opening mystery", "inciting mystery", "first anomaly"]),
        ("clue_investigation", "Clue Investigation", ["clue investigation", "investigation", "clue", "evidence", "lead", "tome", "lore"]),
        ("escalation_pressure", "Escalation / Pressure", ["escalation", "pressure", "threat pressure", "paranoia", "pursuit", "act_2"]),
        ("major_reveal", "Major Reveal", ["major reveal", "reveal", "hidden truth", "truth", "culprit", "entity revealed"]),
        ("confrontation_payoff", "Confrontation / Payoff", ["confrontation", "payoff", "climax", "showdown", "final test", "moral paralysis"]),
    ],
}

_ARC_LENGTH_SPECS: dict[str, dict[str, int | str]] = {
    "One-Shot": {"min": 1, "ideal": 1, "max": 1, "label": "1 chapter"},
    "Short Arc": {"min": 3, "ideal": 4, "max": 5, "label": "3-5 chapters"},
    "Medium Arc": {"min": 6, "ideal": 8, "max": 10, "label": "6-10 chapters"},
    "Long Arc": {"min": 11, "ideal": 14, "max": 16, "label": "11-16 chapters"},
    "Saga": {"min": 17, "ideal": 22, "max": 28, "label": "17-28 chapters"},
    "Season": {"min": 20, "ideal": 26, "max": 32, "label": "20-32 chapters"},
    "Full Series": {"min": 40, "ideal": 60, "max": 80, "label": "40-80 chapters"},
    "Custom": {"min": 1, "ideal": 8, "max": 99, "label": "custom target"},
}


_CHAPTER_CONTENT_FIELDS = {
    "chapter_title",
    "chapter_purpose",
    "structure_section",
    "summary",
    "characters_present",
    "relationships_used",
    "factions_used",
    "threats_used",
    "world_rules_shown",
    "power_system_shown",
    "main_conflict",
    "emotional_beat",
    "twist_or_hook",
    "ending_cliffhanger",
    "custom_chapter_details",
}


def _has_content(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, list):
        return any(_has_content(v) for v in value)
    if isinstance(value, dict):
        return any(_has_content(v) for v in value.values())
    return True


def _is_meaningful_chapter(chapter: dict) -> bool:
    return any(_has_content(chapter.get(field)) for field in _CHAPTER_CONTENT_FIELDS)


def _selected_option_value(value: Any) -> str:
    current = value
    for _ in range(4):
        if isinstance(current, dict):
            current = current.get("selected", "")
            continue
        return str(current).strip() if current is not None else ""
    return ""


def _arc_chapters(plot_data: dict, actual_arc_title: str) -> list[dict]:
    all_chapters = (plot_data.get("chapter_or_episode_list", {}) or {}).get("chapters", []) or []
    meaningful = [c for c in all_chapters if isinstance(c, dict) and _is_meaningful_chapter(c)]
    if actual_arc_title:
        return [c for c in meaningful if (c.get("arc_title") or "").strip() == actual_arc_title]
    return [c for c in meaningful if not (c.get("arc_title") or "").strip()]


def _structural_arc_check(plot_data: dict, arc_title: str | None) -> dict:
    structure_type = (plot_data.get("narrative_structure", {}) or {}).get("selected") or ""
    arc_overview = plot_data.get("story_arc_overview", {}) or {}
    actual_arc_title = (arc_title or arc_overview.get("arc_title") or "").strip()
    arc_length = _selected_option_value(arc_overview.get("arc_length_type", ""))
    length_spec = _ARC_LENGTH_SPECS.get(arc_length, _ARC_LENGTH_SPECS["Custom"])

    arc_chapters = _arc_chapters(plot_data, actual_arc_title)

    sections_def = _ARC_STRUCTURE_SECTIONS.get(structure_type)
    if not sections_def:
        return {
            "arc_title": actual_arc_title,
            "structure_type": structure_type or "Unknown",
            "sections_required": [],
            "sections_required_labels": [],
            "sections_covered": [],
            "sections_missing": [],
            "chapter_count": len(arc_chapters),
            "arc_length_type": arc_length,
            "target_chapter_min": length_spec["min"],
            "target_chapter_ideal": length_spec["ideal"],
            "target_chapter_max": length_spec["max"],
            "target_chapter_label": length_spec["label"],
            "structural_complete": None,
            "structural_reason": (
                "No narrative structure selected. Pick one in the Plot Board to enable structural checks."
                if not structure_type
                else f"Custom or unsupported structure ({structure_type}). Structural check skipped."
            ),
        }

    covered_keys: set[str] = set()
    for c in arc_chapters:
        text_parts = [
            c.get("structure_section"),
            c.get("chapter_title"),
            c.get("chapter_purpose"),
            c.get("summary"),
            c.get("main_conflict"),
            c.get("emotional_beat"),
            c.get("twist_or_hook"),
            c.get("ending_cliffhanger"),
            c.get("custom_chapter_details"),
        ]
        section_text = " ".join(str(part) for part in text_parts if part).lower()
        if not section_text:
            continue
        for key, _label, keywords in sections_def:
            if any(kw in section_text for kw in keywords):
                covered_keys.add(key)

    sections_required = [k for k, _, _ in sections_def]
    section_labels = {k: label for k, label, _ in sections_def}
    sections_missing = [k for k in sections_required if k not in covered_keys]
    minimum_chapters = max(len(sections_required), int(length_spec["min"]))
    structural_complete = len(sections_missing) == 0 and len(arc_chapters) >= minimum_chapters

    if structural_complete:
        reason = f"All {len(sections_required)} required sections covered across {len(arc_chapters)} chapters."
    elif sections_missing:
        missing_labels = [section_labels[k] for k in sections_missing]
        reason = f"Missing: {', '.join(missing_labels)}"
    elif len(arc_chapters) < minimum_chapters:
        reason = f"All sections tagged but only {len(arc_chapters)} chapters. Selected length expects at least {minimum_chapters}."
    else:
        reason = f"All sections tagged but only {len(arc_chapters)} chapters. Structure expects at least {len(sections_required)}."
    if arc_length:
        reason += f" Planned length: {arc_length} ({length_spec['label']})."
        if len(arc_chapters) >= int(length_spec["ideal"]):
            reason += " Arc is at or beyond ideal chapter count; new chapters should resolve or intentionally extend."

    return {
        "arc_title": actual_arc_title,
        "structure_type": structure_type,
        "sections_required": sections_required,
        "sections_required_labels": [section_labels[k] for k in sections_required],
        "sections_covered": sorted(covered_keys),
        "sections_missing": sections_missing,
        "chapter_count": len(arc_chapters),
        "arc_length_type": arc_length,
        "target_chapter_min": length_spec["min"],
        "target_chapter_ideal": length_spec["ideal"],
        "target_chapter_max": length_spec["max"],
        "target_chapter_label": length_spec["label"],
        "structural_complete": structural_complete,
        "structural_reason": reason,
    }


@router.get("/check-arc-completion")
def check_arc_completion(
    story_id: str,
    arc_title: str | None = Query(default=None),
    llm: LLMService = Depends(get_llm_service),
    registry: SQLiteRegistry = Depends(get_registry),
):
    """Return whether the current (or named) arc is complete.

    Two-layer answer:
    - `structural_complete`: deterministic — every required section has at
      least one chapter, and chapter count meets the section count. Always
      runs, even with the LLM disabled.
    - `narrative_complete` + `missing_beats`: LLM-augmented narrative judgment.
      Falls back to the structural answer when the LLM is unavailable.

    The combined `is_complete` is true only when BOTH are true (or when the
    structural check is conclusively true and the LLM is unavailable).
    """
    plot_rec = registry.get_current_file(story_id, "plot_outline")
    plot_data = plot_rec.get("json_copy", {}) if plot_rec else {}
    structural = _structural_arc_check(plot_data, arc_title)

    arc_overview = plot_data.get("story_arc_overview", {}) or {}
    arc_chapters = _arc_chapters(plot_data, structural["arc_title"])

    # Skip the LLM entirely when there are no meaningful chapters; it can only say "not complete"
    # and the structural check already covers that cheaply.
    if not arc_chapters:
        narrative: dict = {
            "narrative_complete": None,
            "narrative_reason": "No chapters yet. Add chapters to enable narrative analysis.",
            "missing_beats": [],
            "llm_used": False,
            "confidence": None,
        }
    else:
        narrative = llm.check_arc_narrative_completion(
            story_id=story_id,
            arc_overview=arc_overview,
            arc_chapters=arc_chapters,
            structural=structural,
        )

    structural_complete = structural["structural_complete"]
    narrative_complete = narrative.get("narrative_complete")
    if structural_complete is True and narrative_complete is True:
        is_complete = True
    elif structural_complete is True and narrative_complete is None:
        # LLM unavailable; trust the structural answer.
        is_complete = True
    elif structural_complete is False:
        is_complete = False
    else:
        is_complete = bool(narrative_complete)

    if is_complete:
        suggestion = "new_arc"
    elif structural_complete is None and not arc_chapters:
        suggestion = "open"
    else:
        suggestion = "extend_arc"

    return ok({
        **structural,
        "narrative_complete": narrative_complete,
        "narrative_reason": narrative.get("narrative_reason", ""),
        "missing_beats": narrative.get("missing_beats", []),
        "is_complete": is_complete,
        "suggestion": suggestion,
        "llm_used": narrative.get("llm_used", False),
        "confidence": narrative.get("confidence"),
    })


@router.post("/analyze-relationships")
def analyze_relationships(
    story_id: str,
    chapter_ids: list[str] = Query(default=[]),
    llm: LLMService = Depends(get_llm_service),
):
    result = llm.analyze_relationships(story_id=story_id, chapter_ids=chapter_ids if chapter_ids else None)
    return ok(result)


@router.post("/apply-relationships")
def apply_relationships(
    story_id: str,
    request: dict,
    char_svc: CharacterService = Depends(get_character_service),
):
    relationships = request.get("relationships", [])
    result = char_svc.apply_relationship_updates(story_id=story_id, relationships=relationships)
    return ok(result)
