"""CRUD operations for the locations[] collection stored in plot_outline.json."""
from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")


def _new_location_id(existing_ids: list[str]) -> str:
    nums = []
    for lid in existing_ids:
        m = re.search(r"(\d+)$", lid)
        if m:
            nums.append(int(m.group(1)))
    n = max(nums, default=0) + 1
    return f"loc_{n:03d}"


class LocationService:
    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService):
        self.registry = registry
        self.snapshot_service = snapshot_service

    # ─── internal helpers ───────────────────────────────────────────────

    def _get_plot_outline(self, story_id: str) -> tuple[dict, dict]:
        rec = self.registry.get_current_file(story_id, "plot_outline")
        if not rec:
            raise MangaMakerError("PLOT_OUTLINE_NOT_FOUND", "plot_outline.json not found", 404)
        return rec, rec.get("json_copy", {}) or {}

    def _locations_block(self, data: dict) -> dict:
        block = data.get("locations")
        if not isinstance(block, dict):
            block = {"locations": []}
            data["locations"] = block
        if not isinstance(block.get("locations"), list):
            block["locations"] = []
        return block

    def _save(self, story_id: str, rec: dict, data: dict) -> None:
        checksum = self.snapshot_service.write_existing_json(path=rec["storage_path"], data=data)
        self.registry.update_file_json_copy(
            story_id=story_id,
            version_id=rec["version_id"],
            file_type="plot_outline",
            json_copy=data,
            checksum=checksum,
            now=datetime.now(timezone.utc).isoformat(),
        )

    # ─── public API ─────────────────────────────────────────────────────

    def list_locations(self, story_id: str) -> list[dict]:
        _, data = self._get_plot_outline(story_id)
        return self._locations_block(data)["locations"]

    def get_location(self, story_id: str, location_id: str) -> dict:
        locs = self.list_locations(story_id)
        for loc in locs:
            if loc.get("location_id") == location_id:
                return loc
        raise MangaMakerError("LOCATION_NOT_FOUND", f"Location {location_id!r} not found", 404)

    def create_location(self, story_id: str, payload: dict[str, Any]) -> dict:
        rec, data = self._get_plot_outline(story_id)
        block = self._locations_block(data)
        locs = block["locations"]

        existing_ids = [loc.get("location_id", "") for loc in locs]
        new_id = payload.get("location_id") or _new_location_id(existing_ids)
        if any(loc.get("location_id") == new_id for loc in locs):
            raise MangaMakerError("LOCATION_ID_CONFLICT", f"location_id {new_id!r} already exists", 409)

        loc = {
            "location_id": new_id,
            "name": payload.get("name", ""),
            "type": payload.get("type", ""),
            "description": payload.get("description", ""),
            "positive_prompt": payload.get("positive_prompt", ""),
            "negative_prompt": payload.get("negative_prompt", ""),
            "used_in_chapters": payload.get("used_in_chapters", []),
        }
        locs.append(loc)
        self._save(story_id, rec, data)
        return loc

    def update_location(self, story_id: str, location_id: str, patch: dict[str, Any]) -> dict:
        rec, data = self._get_plot_outline(story_id)
        block = self._locations_block(data)
        for i, loc in enumerate(block["locations"]):
            if loc.get("location_id") == location_id:
                updated = deepcopy(loc)
                for key, val in patch.items():
                    if key != "location_id":
                        updated[key] = val
                block["locations"][i] = updated
                self._save(story_id, rec, data)
                return updated
        raise MangaMakerError("LOCATION_NOT_FOUND", f"Location {location_id!r} not found", 404)

    def delete_location(self, story_id: str, location_id: str) -> None:
        rec, data = self._get_plot_outline(story_id)
        block = self._locations_block(data)
        before = len(block["locations"])
        block["locations"] = [loc for loc in block["locations"] if loc.get("location_id") != location_id]
        if len(block["locations"]) == before:
            raise MangaMakerError("LOCATION_NOT_FOUND", f"Location {location_id!r} not found", 404)
        self._save(story_id, rec, data)
