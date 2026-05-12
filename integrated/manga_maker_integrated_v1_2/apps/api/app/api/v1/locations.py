"""Location CRUD + AI-fill endpoints."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import require_story_access
from app.core.errors import ok
from app.main_dependencies import get_llm_service, get_registry, get_snapshot_service
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.llm_service import LLMService
from app.services.location_service import LocationService
from app.services.snapshot_service import SnapshotService

router = APIRouter(
    dependencies=[Depends(require_story_access)],
    prefix="/stories/{story_id}/locations",
    tags=["locations"],
)


def _svc(registry: SQLiteRegistry, snapshot: SnapshotService) -> LocationService:
    return LocationService(registry=registry, snapshot_service=snapshot)


class LocationCreate(BaseModel):
    name: str = ""
    type: str = ""
    description: str = ""
    positive_prompt: str = ""
    negative_prompt: str = ""
    used_in_chapters: list[str] = []


class LocationPatch(BaseModel):
    name: str | None = None
    type: str | None = None
    description: str | None = None
    positive_prompt: str | None = None
    negative_prompt: str | None = None
    used_in_chapters: list[str] | None = None


# ─── CRUD ────────────────────────────────────────────────────────────────────

@router.get("")
def list_locations(story_id: str, registry: SQLiteRegistry = Depends(get_registry), snapshot: SnapshotService = Depends(get_snapshot_service)):
    locs = _svc(registry, snapshot).list_locations(story_id)
    return ok(locs)


@router.post("")
def create_location(story_id: str, body: LocationCreate, registry: SQLiteRegistry = Depends(get_registry), snapshot: SnapshotService = Depends(get_snapshot_service)):
    loc = _svc(registry, snapshot).create_location(story_id, body.model_dump())
    return ok(loc)


@router.get("/{location_id}")
def get_location(story_id: str, location_id: str, registry: SQLiteRegistry = Depends(get_registry), snapshot: SnapshotService = Depends(get_snapshot_service)):
    loc = _svc(registry, snapshot).get_location(story_id, location_id)
    return ok(loc)


@router.patch("/{location_id}")
def update_location(story_id: str, location_id: str, body: LocationPatch, registry: SQLiteRegistry = Depends(get_registry), snapshot: SnapshotService = Depends(get_snapshot_service)):
    patch = {k: v for k, v in body.model_dump().items() if v is not None}
    loc = _svc(registry, snapshot).update_location(story_id, location_id, patch)
    return ok(loc)


@router.delete("/{location_id}")
def delete_location(story_id: str, location_id: str, registry: SQLiteRegistry = Depends(get_registry), snapshot: SnapshotService = Depends(get_snapshot_service)):
    _svc(registry, snapshot).delete_location(story_id, location_id)
    return ok({"deleted": location_id})


# ─── AI fill ────────────────────────────────────────────────────────────────

class LocationAiRequest(BaseModel):
    target_fields: list[str] = ["name", "type", "description", "positive_prompt", "negative_prompt"]
    partial_input: dict[str, Any] = {}
    generation_hints: dict[str, Any] = {}


@router.post("/{location_id}/ai-fill")
def ai_fill_location(
    story_id: str,
    location_id: str,
    body: LocationAiRequest,
    registry: SQLiteRegistry = Depends(get_registry),
    snapshot: SnapshotService = Depends(get_snapshot_service),
    llm: LLMService = Depends(get_llm_service),
):
    """Fill location fields using the LLM with full story context."""
    svc = _svc(registry, snapshot)
    loc = svc.get_location(story_id, location_id)

    # Build full context
    context: dict[str, Any] = {}
    for ft in ["master_story", "characters", "plot_outline"]:
        rec = registry.get_current_file(story_id, ft)
        if rec:
            context[ft] = rec.get("json_copy", {})

    # Merge existing location as partial input so LLM has current values
    merged_input = {**loc, **body.partial_input}

    result = llm.generate_fields(
        story_id=story_id,
        page="locations",
        target_fields=body.target_fields,
        partial_input=merged_input,
        context=context,
        generation_hints={
            **body.generation_hints,
            "location_id": location_id,
            "name_hint": loc.get("name", ""),
            "type_hint": loc.get("type", ""),
        },
    )

    generated = result.get("generated_fields", result.get("generated", {}))
    if generated:
        patch = {k: v for k, v in generated.items() if k in body.target_fields}
        if patch:
            loc = svc.update_location(story_id, location_id, patch)

    return ok({"location": loc, "generated": generated, "used_fallback": result.get("used_fallback", False)})


@router.post("/ai-generate-all")
def ai_generate_all_locations(
    story_id: str,
    body: LocationAiRequest,
    registry: SQLiteRegistry = Depends(get_registry),
    snapshot: SnapshotService = Depends(get_snapshot_service),
    llm: LLMService = Depends(get_llm_service),
):
    """Ask LLM to generate a full locations list for this story based on chapters and world context."""
    context: dict[str, Any] = {}
    for ft in ["master_story", "characters", "plot_outline"]:
        rec = registry.get_current_file(story_id, ft)
        if rec:
            context[ft] = rec.get("json_copy", {})

    # Count how many locations already exist so LLM knows target size
    svc = _svc(registry, snapshot)
    existing = svc.list_locations(story_id)
    existing_names = [l.get("name", "") for l in existing if l.get("name")]
    target_count = max(6, 8 - len(existing))  # generate more if fewer exist

    hints = {**body.generation_hints, "count": target_count}

    result = llm.generate_fields(
        story_id=story_id,
        page="locations",
        target_fields=["locations"],
        partial_input=body.partial_input,
        context=context,
        generation_hints=hints,
    )

    generated_locs = (result.get("generated_fields") or result.get("generated") or {}).get("locations", [])
    created = []
    for loc_data in generated_locs:
        if isinstance(loc_data, dict) and loc_data.get("name"):
            # Skip if a location with same name already exists
            if loc_data["name"] in existing_names:
                continue
            loc_data.pop("location_id", None)
            created.append(svc.create_location(story_id, loc_data))

    return ok({"created": created, "count": len(created), "used_fallback": result.get("used_fallback", False)})
