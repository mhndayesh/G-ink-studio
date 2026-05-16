from __future__ import annotations

"""Per-character export artifacts: the visual reference sheet lines, the
per-character prompt .txt / sheet .md files, the panels.csv, and the small
_profile_role / _profile_bio helpers. Pure logic. Driven by app/api/v1/export.py
(and used by the story/visuals assemblers) via the export_service facade.
"""

import csv
import io

from app.services.export_shared import _appearance_block, _as_list, _build_scene_by_id, _safe, _selected, _text_list
from app.services.visual_prompt import STYLE_PREFIX, canonical_camera_shot, compile_visual_prompt, negative_prompt, sanitize_visual_prompt


def _character_reference_lines(characters: dict) -> list[str]:
    """Per-character visual reference sheet for the artist."""
    lines: list[str] = []
    profiles = (characters.get("created_major_character_profiles", []) or []) + (characters.get("created_side_character_profiles", []) or [])
    if not profiles:
        return lines
    lines += ["CHARACTER REFERENCE SHEETS", "=" * 26, ""]
    for profile in profiles:
        if not isinstance(profile, dict):
            continue
        name = _safe(profile.get("character_name"))
        if not name:
            continue
        # Spec: character names lowercase — parser silently drops fields otherwise
        name = name.lower()
        role = _profile_role(profile)
        header = name + (f" - {role}" if role else "")
        lines += [header, "-" * len(header)]
        details = _appearance_block(profile)
        for key, label in [
            ("age_range", "Age"),
            ("gender_presentation", "Gender presentation"),
            ("height", "Height"),
            ("body_type", "Body type"),
            ("silhouette_shape", "Silhouette"),
            ("face_shape", "Face shape"),
            ("skin_tone_or_markings", "Skin / markings"),
            ("hair_style", "Hair style"),
            ("hair_color", "Hair color"),
            ("eye_shape", "Eye shape"),
            ("eye_color", "Eye color"),
            ("clothing_style", "Clothing style"),
            ("main_outfit_description", "Main outfit"),
            ("iconic_item", "Iconic item"),
            ("expression_style", "Expression style"),
            ("pose_language", "Pose language"),
            ("manga_panel_presence", "Panel presence"),
            ("first_impression_visual", "First impression"),
        ]:
            v = details.get(key)
            text = ", ".join(_text_list(v)) if isinstance(v, list) else _safe(v)
            if text:
                lines.append(f"  {label}: {text}")
        for key, label in [
            ("distinctive_features", "Distinctive features"),
            ("scars_or_birthmarks", "Scars / birthmarks"),
            ("alternate_outfits", "Alternate outfits"),
            ("accessories", "Accessories"),
            ("weapons_or_tools_visible", "Weapons / tools"),
            ("color_palette", "Color palette"),
        ]:
            text = ", ".join(_text_list(details.get(key, [])))
            if text:
                lines.append(f"  {label}: {text}")
        symbol = _safe(details.get("visual_symbol_or_motif"))
        if symbol:
            lines.append(f"  Visual symbol / motif: {symbol}")
        contrast = _safe(details.get("visual_contrast_with_other_characters"))
        if contrast:
            lines.append(f"  Visual contrast: {contrast}")
        lines.append(f"  AI prompt (positive): {compile_visual_prompt(', '.join(_character_visual_phrases(details, profile)))}")
        lines.append(f"  AI prompt (negative): {negative_prompt(details.get('negative_prompt_notes'))}")
        lines.append("")
    return lines

def _panels_csv(scripts: list[dict], plot_outline: dict | None = None) -> str:
    """Per-panel CSV for spreadsheet workflows. One row per panel across all chapters.

    When ``plot_outline`` is provided, the ``lighting`` column falls back to the
    scene's ``time`` value (Night/Morning/Afternoon/Evening) when a panel has no
    explicit lighting set — audit item #7.
    """
    import csv
    scenes_by_id = _build_scene_by_id(plot_outline or {})
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "chapter_number", "chapter_id", "chapter_title",
        "page_number", "page_id", "scene_id",
        "panel_number", "panel_id", "panel_size", "camera_shot", "pacing",
        "visual", "character_action", "background_details",
        "facial_expression", "pose_or_body_language", "mood",
        "characters_in_panel", "lighting",
        "narration", "dialogue_count", "sfx_text",
        "continuity_notes",
    ])
    for cs in scripts:
        meta = cs.get("chapter_metadata", {}) or {}
        ch_num = _safe(meta.get("chapter_number"))
        ch_id = _safe(meta.get("chapter_id"))
        ch_title = _safe(meta.get("chapter_title"))
        for page in _as_list(cs.get("pages")):
            if not isinstance(page, dict):
                continue
            page_num = _safe(page.get("page_number"))
            page_id = _safe(page.get("page_id"))
            scene_id = _safe(page.get("scene_id"))
            scene_time = _safe((scenes_by_id.get(scene_id) or {}).get("time")) if scene_id else ""
            for panel in _as_list(page.get("panels")):
                if not isinstance(panel, dict):
                    continue
                shot_block = panel.get("camera_shot")
                size_block = panel.get("panel_size")
                pacing_block = panel.get("pacing")
                sfx_items = _as_list(panel.get("sound_effects"))
                sfx_text = "; ".join(
                    _safe(s.get("sfx_text")) if isinstance(s, dict) else _safe(s)
                    for s in sfx_items
                    if (isinstance(s, dict) and _safe(s.get("sfx_text"))) or (isinstance(s, str) and s.strip())
                )
                shot_raw = _selected(shot_block) if isinstance(shot_block, dict) else _safe(shot_block)
                expr = _safe(panel.get("facial_expression"))
                if expr.strip().lower().startswith(("n/a", "none", "not applicable")):
                    expr = ""
                chars_in_panel = _as_list(panel.get("characters_in_panel"))
                chars_cell = "; ".join(_safe(c) for c in chars_in_panel if _safe(c))
                lighting_cell = _safe(panel.get("lighting")) or scene_time
                writer.writerow([
                    ch_num, ch_id, ch_title,
                    page_num, page_id, scene_id,
                    _safe(panel.get("panel_number")),
                    _safe(panel.get("panel_id")),
                    _selected(size_block) if isinstance(size_block, dict) else _safe(size_block),
                    canonical_camera_shot(shot_raw),  # BUNDLE-AUDIT #2
                    _selected(pacing_block) if isinstance(pacing_block, dict) else _safe(pacing_block),
                    _safe(panel.get("visual")),
                    _safe(panel.get("character_action")),
                    _safe(panel.get("background_details")),
                    expr,
                    _safe(panel.get("pose_or_body_language")),
                    _safe(panel.get("mood")),
                    chars_cell,
                    lighting_cell,
                    _safe(panel.get("narration")),
                    len(_as_list(panel.get("dialogue"))),
                    sfx_text,
                    _safe(panel.get("continuity_notes")),
                ])
    return buf.getvalue()

def _character_visual_phrases(details: dict, profile: dict | None = None) -> list[str]:
    """Visual-only descriptor fragments for a character, drawn from the structured
    appearance fields (no scene / pose / lighting / colour — see visual_prompt.py)."""
    parts: list[object] = []
    for key in ("age_range", "gender_presentation", "height", "body_type", "silhouette_shape",
                "face_shape", "skin_tone_or_markings", "hair_style", "eye_shape",
                "clothing_style", "main_outfit_description", "iconic_item",
                "visual_symbol_or_motif"):
        parts.append(details.get(key))
    for key in ("distinctive_features", "scars_or_birthmarks", "accessories", "weapons_or_tools_visible"):
        parts.extend(_text_list(details.get(key, [])))
    # Audit fix #4: identity-anchoring fields so generated panels stay recognisable across shots
    for key in ("expression_style", "pose_language", "manga_panel_presence"):
        parts.append(details.get(key))
    # the LLM-written notes go last so the structured fields anchor the prompt
    parts.append(details.get("ai_image_prompt_notes"))
    phrases: list[str] = []
    seen: set[str] = set()
    for part in parts:
        for ph in sanitize_visual_prompt(part).split(", "):
            k = ph.lower()
            if ph and k not in seen:
                seen.add(k)
                phrases.append(ph)
    return phrases

def _ai_prompt_files(characters: dict) -> dict[str, str]:
    """One file per character holding a clean, B&W-manga AI image prompt (positive + negative)."""
    out: dict[str, str] = {}
    profiles = (characters.get("created_major_character_profiles", []) or []) + (characters.get("created_side_character_profiles", []) or [])
    for p in profiles:
        if not isinstance(p, dict):
            continue
        name = _safe(p.get("character_name"))
        if not name:
            continue
        details = _appearance_block(p)
        phrases = _character_visual_phrases(details, p)
        pos = compile_visual_prompt(", ".join(phrases))
        neg = negative_prompt(details.get("negative_prompt_notes"))
        if pos == STYLE_PREFIX and not phrases:
            continue
        safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip().replace(" ", "_") or "character"
        out[f"{safe_name}.txt"] = f"# Positive prompt\n{pos}\n\n# Negative prompt\n{neg}\n"
    return out

def _character_sheet_files(characters: dict) -> dict[str, str]:
    """One Markdown file per character with their full visual sheet."""
    out: dict[str, str] = {}
    profiles = (characters.get("created_major_character_profiles", []) or []) + (characters.get("created_side_character_profiles", []) or [])
    for p in profiles:
        if not isinstance(p, dict):
            continue
        name = _safe(p.get("character_name"))
        if not name:
            continue
        details = _appearance_block(p)
        if not details:
            continue
        safe_name = "".join(c if c.isalnum() or c in "-_ " else "_" for c in name).strip().replace(" ", "_") or "character"
        md: list[str] = [f"# {name}"]
        role = _profile_role(p)
        if role:
            md.append(f"_{role}_\n")
        for key, label in [
            ("age_range", "Age"),
            ("gender_presentation", "Gender"),
            ("body_type", "Body type"),
            ("face_shape", "Face shape"),
            ("hair_style", "Hair"),
            ("hair_color", "Hair color"),
            ("eye_color", "Eye color"),
            ("clothing_style", "Clothing"),
            ("main_outfit_description", "Outfit"),
            ("iconic_item", "Iconic item"),
            ("expression_style", "Expression style"),
            ("pose_language", "Pose language"),
            ("manga_panel_presence", "Panel presence"),
        ]:
            v = _safe(details.get(key))
            if v:
                md.append(f"**{label}**: {v}")
        for key, label in [
            ("distinctive_features", "Distinctive features"),
            ("accessories", "Accessories"),
            ("weapons_or_tools_visible", "Weapons / tools"),
            ("color_palette", "Color palette"),
        ]:
            text = ", ".join(_text_list(details.get(key, [])))
            if text:
                md.append(f"**{label}**: {text}")
        md.append(f"\n## AI prompt (positive)\n{compile_visual_prompt(', '.join(_character_visual_phrases(details, p)))}")
        md.append(f"\n## AI prompt (negative)\n{negative_prompt(details.get('negative_prompt_notes'))}")
        out[f"{safe_name}.md"] = "\n\n".join(md) + "\n"
    return out


# ─── routes ──────────────────────────────────────────────────────────────────

def _profile_role(profile: dict) -> str:
    """Resolve a character profile's role from the canonical template path."""
    role_block = profile.get("character_role_level")
    if isinstance(role_block, dict):
        sel = _safe(role_block.get("selected"))
        if sel:
            return sel
        custom = _safe(role_block.get("custom_character_role_level"))
        if custom:
            return custom
    return _safe(profile.get("profile_label"))

def _profile_bio(profile: dict) -> str:
    """Build a one-paragraph bio from real character template fields."""
    bits: list[str] = []
    backstory = profile.get("character_backstory_mental_state_and_community_place", {}) or {}
    bd = backstory.get("backstory_details", {}) if isinstance(backstory, dict) else {}
    if isinstance(bd, dict):
        for key in ("childhood_summary", "important_past_event", "past_trauma_or_wound"):
            v = _safe(bd.get(key))
            if v:
                bits.append(v)
                break
    personality = profile.get("character_personality", {}) or {}
    pd = personality.get("personality_details", {}) if isinstance(personality, dict) else {}
    if isinstance(pd, dict):
        traits = _text_list(pd.get("core_traits") or pd.get("positive_traits") or [])
        if traits:
            bits.append("Traits: " + ", ".join(traits[:5]))
    powers = profile.get("optional_powers_and_power_level") or profile.get("powers_and_abilities", {}) or {}
    if isinstance(powers, dict) and powers.get("is_enabled"):
        pdetails = powers.get("power_details", {}) if isinstance(powers.get("power_details"), dict) else {}
        pname = _safe(pdetails.get("power_name"))
        if pname:
            bits.append(f"Power: {pname}")
    return " - ".join(bits)
