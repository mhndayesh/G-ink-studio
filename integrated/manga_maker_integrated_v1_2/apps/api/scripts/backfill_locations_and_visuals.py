"""
Idempotent migration: backfill locations[], faction_visual_signatures, render_mode,
and location_id fields onto existing stories.

Safe to re-run — only adds fields that are missing.

Usage:
    .\.venv\Scripts\python.exe scripts\backfill_locations_and_visuals.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure project root is on the path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.db.sqlite_registry import SQLiteRegistry  # noqa: E402


def _patch_plot_outline(data: dict) -> tuple[dict, bool]:
    changed = False

    # Add locations block if missing
    if "locations" not in data:
        data["locations"] = {"note_to_user": "Named locations used across the story.", "locations": []}
        changed = True
    elif isinstance(data["locations"], dict) and "locations" not in data["locations"]:
        data["locations"]["locations"] = []
        changed = True

    # Add location_id to each scene card
    scene_cards = data.get("scene_cards", {})
    if isinstance(scene_cards, dict):
        for scene in scene_cards.get("scenes", []):
            if isinstance(scene, dict) and "location_id" not in scene:
                scene["location_id"] = ""
                changed = True

    return data, changed


def _patch_master_story(data: dict) -> tuple[dict, bool]:
    changed = False

    if "faction_visual_signatures" not in data:
        data["faction_visual_signatures"] = {
            "note_to_user": "Visual identity per faction — injected into panel AI prompts.",
            "signatures": [],
        }
        changed = True

    return data, changed


def _patch_chapter_script(data: dict) -> tuple[dict, bool]:
    changed = False

    # scene_breakdown: add location_id
    for scene in data.get("chapter_scene_breakdown", []):
        if isinstance(scene, dict) and "location_id" not in scene:
            scene["location_id"] = ""
            changed = True

    # pages > panels: add location_id + render_mode
    for page in data.get("pages", []):
        if not isinstance(page, dict):
            continue
        for panel in page.get("panels", []):
            if not isinstance(panel, dict):
                continue
            if "location_id" not in panel:
                panel["location_id"] = ""
                changed = True
            if "render_mode" not in panel:
                panel["render_mode"] = {"selected": "t2i", "options": ["t2i", "i2i", "layered"]}
                changed = True

    return data, changed


PATCHERS = {
    "plot_outline": _patch_plot_outline,
    "master_story": _patch_master_story,
    "chapter_script": _patch_chapter_script,
}


def run(registry: SQLiteRegistry) -> None:
    stories = registry.list_stories()
    print(f"Found {len(stories)} stories.")

    for story in stories:
        story_id = story["story_id"]
        print(f"\nStory: {story_id}")

        for file_type, patcher in PATCHERS.items():
            rec = registry.get_current_file(story_id, file_type)
            if not rec:
                print(f"  {file_type}: not found — skipping")
                continue

            data = rec.get("json_copy", {}) or {}
            patched, changed = patcher(data)
            if changed:
                registry.update_file(story_id, file_type, patched)
                print(f"  {file_type}: patched")
            else:
                print(f"  {file_type}: already up-to-date")

    # Also patch version snapshot files on disk (story_files rows)
    print("\nDone.")


if __name__ == "__main__":
    db_path = ROOT / "storage" / "manga_registry.sqlite"
    if not db_path.exists():
        print(f"Registry not found at {db_path}. Start the app at least once first.")
        sys.exit(1)

    registry = SQLiteRegistry(str(db_path))
    run(registry)
