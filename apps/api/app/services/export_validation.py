from __future__ import annotations

"""Export data-quality validation — `_validate_export` (the warnings the
export tool can't fix on its own) and `_format_validation_lines` (renders the
report into validation_report.md for the triple-zip). Pure logic. Driven by
app/api/v1/export.py via the export_service facade.
"""

from app.services.export_shared import _appearance_block, _as_list, _build_loc_by_id, _safe, _text_list
from app.services.visual_prompt import has_visual_noise, sanitize_visual_prompt


# ─── validation ─────────────────────────────────────────────────────────────

def _validate_export(files: dict, all_scripts: list[dict]) -> dict:
    """Surface data-quality issues that the export tool can't fix on its own.

    Each warning has level (critical/high/medium/info), category, message, where.
    Designed to mirror the G-Ink Studio compatibility requirements so the user
    sees what's missing before downloading.
    """
    warnings: list[dict] = []
    ms = files.get("master_story", {}) or {}
    ch = files.get("characters", {}) or {}
    po = files.get("plot_outline", {}) or {}

    # 1. Pages-per-chapter sanity (missing scene_cards causes single-page chapters)
    chapters = _as_list((po.get("chapter_or_episode_list", {}) or {}).get("chapters", []))
    scene_cards = _as_list((po.get("scene_cards", {}) or {}).get("scenes", []))
    scenes_by_chapter: dict[str, list] = {}
    for sc in scene_cards:
        if isinstance(sc, dict):
            cid = _safe(sc.get("chapter_id"))
            if cid:
                scenes_by_chapter.setdefault(cid, []).append(sc)

    pages_by_chapter: dict[str, list] = {}
    for cs in all_scripts:
        cid = _safe((cs.get("chapter_metadata") or {}).get("chapter_id"))
        if cid:
            pages_by_chapter[cid] = _as_list(cs.get("pages"))

    for chap in chapters:
        if not isinstance(chap, dict):
            continue
        cid = _safe(chap.get("chapter_id"))
        ch_num = _safe(chap.get("chapter_number")) or "?"
        scene_count = len(scenes_by_chapter.get(cid, []))
        page_count = len(pages_by_chapter.get(cid, []))
        if scene_count >= 2 and page_count <= 1:
            warnings.append({
                "level": "high",
                "category": "missing_pages",
                "message": (
                    f"Chapter {ch_num} has {scene_count} scenes defined but only {page_count} page(s) in script. "
                    "Regenerate the script after scenes are populated to expand to one page per scene."
                ),
                "where": "Studio → Manga Script → Generate (per chapter)",
            })

    # 2. Speakers without character profiles
    profiles = _as_list(ch.get("created_major_character_profiles", [])) + _as_list(ch.get("created_side_character_profiles", []))
    profile_names_lower: set[str] = set()
    for p in profiles:
        if isinstance(p, dict):
            n = _safe(p.get("character_name") or p.get("name"))
            if n:
                profile_names_lower.add(n.lower())

    speakers_seen: set[str] = set()
    # Bubble types that mark ambient / non-character voices (TV, PA, radio, narration
    # captions, monster effects). Speakers behind these bubbles are intentionally NOT
    # real character profiles and must not raise missing_profile warnings.
    AMBIENT_BUBBLES = {"narration", "off-screen", "monster / distorted"}
    for cs in all_scripts:
        for page in _as_list(cs.get("pages")):
            if not isinstance(page, dict):
                continue
            for panel in _as_list(page.get("panels")):
                if not isinstance(panel, dict):
                    continue
                for d in _as_list(panel.get("dialogue", [])):
                    if not isinstance(d, dict):
                        continue
                    bubble_block = d.get("speech_bubble_type")
                    bubble = (_safe(bubble_block.get("selected")) if isinstance(bubble_block, dict) else _safe(bubble_block)).lower()
                    if bubble in AMBIENT_BUBBLES:
                        continue  # ambient voice, not a character
                    speaker = _safe(d.get("speaker_name") or d.get("speaker") or d.get("speaker_id"))
                    if speaker:
                        speakers_seen.add(speaker.lower())

    # Skip narrators, generic background labels, and obvious source voices —
    # none of these need a real character profile.
    skip_speakers = {
        "narrator", "narration", "?", "",
        "background character", "background", "extra", "crowd", "bystander",
        "tv", "radio", "pa", "intercom", "loudspeaker", "phone", "voice",
        "off-screen voice", "off-screen", "voice-over", "voice over", "vo",
        "sign", "announcement", "anchor", "newscaster", "reporter",
    }
    missing_speakers = sorted(s for s in speakers_seen if s not in skip_speakers and s not in profile_names_lower)
    for speaker in missing_speakers:
        warnings.append({
            "level": "high",
            "category": "missing_profile",
            "message": (
                f"Speaker '{speaker}' has dialogue but no character profile. "
                "G-Ink Studio will skip this character; add a major or side profile."
            ),
            "where": "Studio → Cast (major) or Side Characters",
        })

    # 3. FACTION VISUALS missing when factions defined
    factions_block = ms.get("major_factions_and_ruling_sides", {}) or {}
    factions = _text_list(factions_block.get("selected", []) if isinstance(factions_block, dict) else [])
    factions = [f for f in factions if f and f != "Custom"]
    sigs = _as_list((ms.get("faction_visual_signatures", {}) or {}).get("signatures", []))
    sigs = [s for s in sigs if isinstance(s, dict) and _safe(s.get("faction_name")) and _safe(s.get("visual_signature"))]
    if factions and not sigs:
        warnings.append({
            "level": "medium",
            "category": "missing_faction_visuals",
            "message": (
                f"{len(factions)} faction(s) defined but no FACTION VISUALS populated. "
                "Without visual signatures, faction-specific gear can't be injected into panel prompts."
            ),
            "where": "Studio → Faction Visuals",
        })

    # 4. LOCATIONS section empty
    locs = _as_list((po.get("locations", {}) or {}).get("locations", []))
    if not locs:
        warnings.append({
            "level": "critical",
            "category": "missing_locations",
            "message": (
                "No LOCATIONS defined. The studio falls back to keyword heuristics; "
                "AI prompts will be inconsistent across panels."
            ),
            "where": "Studio → Locations",
        })

    # 5. Pages without location_id (≥30% threshold)
    pages_without_loc = 0
    total_pages = 0
    for cs in all_scripts:
        for page in _as_list(cs.get("pages")):
            if not isinstance(page, dict):
                continue
            total_pages += 1
            if not _safe(page.get("location_id")):
                pages_without_loc += 1
    if total_pages > 0 and pages_without_loc / total_pages >= 0.3:
        warnings.append({
            "level": "medium",
            "category": "missing_location_id",
            "message": (
                f"{pages_without_loc}/{total_pages} pages have no location_id. "
                "Run 'Generate All' in Visuals Studio so each panel resolves to a named location."
            ),
            "where": "Studio → Visuals Studio",
        })

    # 5b. Pages whose declared Location isn't mentioned in any of their panels
    #     (BUNDLE-AUDIT #1 — the scene→location map looks scrambled). The export
    #     repairs the header when it can; this flags it so the source gets fixed.
    loc_by_id = _build_loc_by_id(po)
    all_loc_names = {
        _safe(l.get("name")) for l in _as_list((po.get("locations") or {}).get("locations", []))
    } | {_safe(v.get("name")) for v in loc_by_id.values()}
    all_loc_names = {n for n in all_loc_names if len(n) >= 4}
    mismatched: list[str] = []
    for cs in all_scripts:
        ch_num = _safe((cs.get("chapter_metadata") or {}).get("chapter_number") or (cs.get("chapter_metadata") or {}).get("chapter_id"))
        scene_loc_name = {
            _safe(s.get("scene_id")): _safe(s.get("location"))
            for s in _as_list(cs.get("chapter_scene_breakdown")) if isinstance(s, dict) and s.get("location")
        }
        for page in _as_list(cs.get("pages")):
            if not isinstance(page, dict):
                continue
            lid = _safe(page.get("location_id"))
            name = _safe(loc_by_id.get(lid, {}).get("name")) if lid in loc_by_id else scene_loc_name.get(_safe(page.get("scene_id")), "")
            if len(name) < 4:
                continue
            ptext = " ".join(
                f"{_safe(pn.get('visual'))} {_safe(pn.get('background_details'))} {_safe(pn.get('character_action'))}"
                for pn in _as_list(page.get("panels")) if isinstance(pn, dict)
            ).lower()
            if ptext and name.lower() not in ptext and any(n.lower() in ptext for n in all_loc_names if n != name):
                mismatched.append(f"Ch{ch_num} p{_safe(page.get('page_number'))} (says {name!r})")
    if mismatched:
        warnings.append({
            "level": "high",
            "category": "location_mismatch",
            "message": (
                "Page Location(s) don't match the panel content — the scene→location map looks scrambled: "
                + "; ".join(mismatched[:8]) + (f" (+{len(mismatched) - 8} more)" if len(mismatched) > 8 else "")
                + ". The export auto-corrects the header where it can; fix the scene→location assignment at the source so Purpose / Location / panel visuals agree."
            ),
            "where": "Studio → Plot Board (scene cards) / Visuals Studio",
        })

    # 6. Character names not lowercased in source data (info — export auto-lowers)
    upper_names: list[str] = []
    for p in profiles:
        if isinstance(p, dict):
            n = _safe(p.get("character_name") or p.get("name"))
            if n and n != n.lower():
                upper_names.append(n)
    if upper_names:
        sample = ", ".join(upper_names[:5]) + (f" (+{len(upper_names) - 5} more)" if len(upper_names) > 5 else "")
        warnings.append({
            "level": "info",
            "category": "name_case",
            "message": (
                f"Character profile name(s) not lowercased: {sample}. "
                "Export auto-lowercases for studio compatibility, but consider renaming in the source."
            ),
            "where": "Studio → Cast",
        })

    # 7. Visual prompts that carry colour / lighting / style noise (info —
    #    export now auto-cleans these and prepends "black and white Japanese
    #    manga style", but it's worth flagging so the source gets fixed).
    dirty_chars: list[str] = []
    for p in profiles:
        if not isinstance(p, dict):
            continue
        det = _appearance_block(p)
        if has_visual_noise(det.get("ai_image_prompt_notes")):
            dirty_chars.append(_safe(p.get("character_name") or p.get("name")))
    dirty_locs: list[str] = []
    for loc in _as_list((po.get("locations") or {}).get("locations", [])):
        if isinstance(loc, dict) and has_visual_noise(loc.get("positive_prompt")):
            dirty_locs.append(_safe(loc.get("name")))
    if dirty_chars or dirty_locs:
        bits = []
        if dirty_chars:
            bits.append("character sheet(s): " + ", ".join(filter(None, dirty_chars[:6])))
        if dirty_locs:
            bits.append("location(s): " + ", ".join(filter(None, dirty_locs[:6])))
        warnings.append({
            "level": "info",
            "category": "prompt_noise",
            "message": (
                "AI image prompt(s) contain colour / lighting / 'cinematic'-style words or a per-entity "
                "style tag — " + "; ".join(bits) + ". The export strips these and prepends "
                "'black and white Japanese manga style' automatically; consider cleaning the source so the "
                "stored prompt is already a short visual-only descriptor list."
            ),
            "where": "Studio → Cast / Locations / Faction Visuals",
        })

    return {"warnings": warnings, "count": len(warnings)}


def _format_validation_lines(report: dict) -> list[str]:
    """Render the validation report as a list of markdown-friendly lines."""
    lines: list[str] = ["VALIDATION REPORT", "=" * 17, ""]
    warnings = _as_list(report.get("warnings"))
    if not warnings:
        lines.append("No issues detected. Story export is fully compatible with G-Ink Studio.")
        return lines

    lines.append(f"{len(warnings)} issue(s) detected. Review below before importing into G-Ink Studio.")
    lines.append("")

    by_level: dict[str, list[dict]] = {}
    for w in warnings:
        by_level.setdefault(_safe(w.get("level"), "info"), []).append(w)

    for level in ["critical", "high", "medium", "info"]:
        items = by_level.get(level, [])
        if not items:
            continue
        lines.append(f"{level.upper()} ({len(items)})")
        lines.append("-" * (len(level) + len(str(len(items))) + 3))
        for w in items:
            cat = _safe(w.get("category"))
            msg = _safe(w.get("message"))
            where = _safe(w.get("where"))
            lines.append(f"[{cat}] {msg}")
            if where:
                lines.append(f"  Where to fix: {where}")
            lines.append("")
    return lines
