from __future__ import annotations

"""Stable relationship IDs (``rel_<slugA>__<slugB>``) and back-filling them into
LLM-generated plot-thread output.

The LLM context shows these IDs so the model can reference a relationship/character/
threat without inventing one; ``backfill_thread_ids`` then fills any it still left
blank by name-matching the item text against the saved cast/relationships. Without
that, thread items with an empty id-field get silently dropped on save. See
AGENTS.md ("Stable relationship IDs").
"""

import re
from typing import Any

# Stable relationship ID derived from "A / B" so plot_threads.relationship_threads
# can reference an entry without the LLM needing to invent IDs.
def slugify_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")


def stable_rel_id_from_pair(pair: str) -> str:
    parts = [p.strip() for p in (pair or "").split("/") if p.strip()]
    if len(parts) < 2:
        return ""
    return f"rel_{slugify_name(parts[0])}__{slugify_name(parts[1])}"




def backfill_thread_ids(*, generated: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """Ensure plot_threads items carry stable IDs even when the LLM omits them.

    The frontend's per-tab save (saveItemListThreads) silently drops items
    whose id-field is empty, so a missing relationship_id / character_id /
    threat_id_or_name = lost work. Fill them here from saved characters.json
    and master_story.json by matching on names found in the item's text.
    """
    chars_data = context.get("characters", {}) if isinstance(context, dict) else {}
    ms_data = context.get("master_story", {}) if isinstance(context, dict) else {}

    # Build lookups: lowercase name → id, plus relationship slug → id.
    major_profiles = chars_data.get("created_major_character_profiles", []) or []
    char_by_name: dict[str, str] = {}
    for p in major_profiles:
        name = (p.get("character_name") or "").strip().lower()
        cid = p.get("profile_id") or p.get("character_name") or ""
        if name and cid:
            char_by_name[name] = cid

    rel_lookup: list[dict[str, str]] = []
    for r in chars_data.get("character_relationship_map", {}).get("relationships", []) or []:
        if not isinstance(r, dict):
            continue
        pair = r.get("characters_involved", "") or ""
        parts = [p.strip() for p in pair.split("/") if p.strip()]
        if len(parts) < 2:
            continue
        rid = r.get("relationship_id") or stable_rel_id_from_pair(pair)
        if not rid:
            continue
        rel_lookup.append({"id": rid, "a": parts[0].lower(), "b": parts[1].lower(), "pair": pair})

    threats: list[str] = []
    threats_block = ms_data.get("major_threats_and_minor_side_threats", {}) if isinstance(ms_data, dict) else {}
    if threats_block.get("major_threat"):
        threats.append(str(threats_block["major_threat"]))
    threats.extend([str(t) for t in threats_block.get("minor_side_threats", []) if t])

    def _flatten(*values: Any) -> str:
        buf: list[str] = []
        for v in values:
            if isinstance(v, str):
                buf.append(v)
            elif isinstance(v, list):
                buf.extend(str(x) for x in v if x)
            elif v is not None:
                buf.append(str(v))
        return " ".join(buf).lower()

    def _find_char_id(blob: str) -> str:
        for name, cid in char_by_name.items():
            if name and name in blob:
                return cid
        return ""

    def _find_rel_id(blob: str, hint_pair: str = "") -> str:
        if hint_pair:
            hp = stable_rel_id_from_pair(hint_pair)
            if hp:
                return hp
        for r in rel_lookup:
            if r["a"] in blob and r["b"] in blob:
                return r["id"]
        return ""

    def _find_threat(blob: str) -> str:
        for t in threats:
            if t and t.lower() in blob:
                return t
        return ""

    # Relationship threads
    rels = generated.get("relationship_threads") or generated.get("relationships")
    if isinstance(rels, list):
        for item in rels:
            if not isinstance(item, dict) or item.get("relationship_id"):
                continue
            hint_pair = item.get("characters_involved") or ""
            if not hint_pair:
                a = item.get("from") or item.get("character_a") or ""
                b = item.get("to") or item.get("character_b") or ""
                if a and b:
                    hint_pair = f"{a}/{b}"
            blob = _flatten(item.get("start_dynamic"), item.get("breaking_point"), item.get("final_dynamic"), item.get("change_beats"), hint_pair)
            rid = _find_rel_id(blob, hint_pair)
            if rid:
                item["relationship_id"] = rid

    # Character arc threads
    char_arcs = generated.get("character_arc_threads") or generated.get("character_arcs")
    if isinstance(char_arcs, list):
        for item in char_arcs:
            if not isinstance(item, dict) or item.get("character_id"):
                continue
            blob = _flatten(item.get("starting_state"), item.get("lowest_point"), item.get("final_state"), item.get("growth_beats"))
            cid = _find_char_id(blob)
            if cid:
                item["character_id"] = cid

    # Threat threads
    threat_arr = generated.get("threat_threads") or generated.get("threats")
    if isinstance(threat_arr, list):
        for item in threat_arr:
            if not isinstance(item, dict) or item.get("threat_id_or_name"):
                continue
            blob = _flatten(item.get("first_hint"), item.get("reveal"), item.get("final_outcome"), item.get("escalation_beats"))
            t = _find_threat(blob)
            if t:
                item["threat_id_or_name"] = t

    # Power threads
    powers = generated.get("power_threads") or generated.get("powers")
    if isinstance(powers, list):
        for item in powers:
            if not isinstance(item, dict) or item.get("character_id"):
                continue
            blob = _flatten(item.get("power_name"), item.get("first_use"), item.get("breakthrough"), item.get("cost_or_consequence"), item.get("training_or_failure_beats"))
            cid = _find_char_id(blob)
            if cid:
                item["character_id"] = cid

    return generated

