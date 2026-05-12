from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query
from pydantic import BaseModel

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_chapter_script_service, get_character_service, get_llm_service, get_registry, get_version_service
from app.models.api import ChapterScriptPatchRequest
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.chapter_script_service import ChapterScriptService
from app.services.character_service import CharacterService
from app.services.llm_service import LLMService
from app.services.version_service import VersionService
from app.api.v1.characters import _collect_script_speakers, _SKIP_SPEAKERS


class FillVisualsAllRequest(BaseModel):
    chapter_ids: list[str] = []
    available_locations: list[dict[str, Any]] = []

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/chapter-script", tags=["chapter-script"])


@router.get("")
def get_script(
    story_id: str,
    chapter_id: str = Query(default=""),
    service: ChapterScriptService = Depends(get_chapter_script_service),
):
    return ok(service.get_script(story_id, chapter_id=chapter_id))


@router.get("/chapters-status")
def get_chapters_script_status(
    story_id: str,
    service: ChapterScriptService = Depends(get_chapter_script_service),
):
    """Return per-chapter script status for all chapters in the plot outline."""
    return ok(service.get_chapters_script_status(story_id))


@router.post("/load")
def load_from_history(
    story_id: str,
    chapter_id: str = Query(default=""),
    service: ChapterScriptService = Depends(get_chapter_script_service),
):
    """Load a previously-generated chapter script from version history back into the working file."""
    return ok(service.load_from_history(story_id, chapter_id=chapter_id))


@router.post("/validate")
def validate_script(story_id: str, service: ChapterScriptService = Depends(get_chapter_script_service)):
    return ok(service.validate_script(story_id))


@router.post("/generate")
def generate_script(
    story_id: str,
    chapter_id: str = Query(default=""),
    service: ChapterScriptService = Depends(get_chapter_script_service),
):
    return ok(service.generate_from_workspace(story_id, chapter_id=chapter_id))


@router.patch("")
def patch_script(story_id: str, request: ChapterScriptPatchRequest, service: ChapterScriptService = Depends(get_chapter_script_service)):
    return ok(service.patch_script(story_id=story_id, target_branch=request.target_branch, operation=request.operation, value=request.value))


@router.post("/extract-events")
def extract_events(
    story_id: str,
    chapter_id: str = Query(default=""),
    service: ChapterScriptService = Depends(get_chapter_script_service),
):
    return ok(service.extract_events(story_id, chapter_id=chapter_id))


@router.post("/generate-batch")
def generate_batch(
    story_id: str,
    chapter_ids: list[str] = Body(default=[]),
    service: ChapterScriptService = Depends(get_chapter_script_service),
    version_service: VersionService = Depends(get_version_service),
    character_service: CharacterService = Depends(get_character_service),
    registry: SQLiteRegistry = Depends(get_registry),
):
    """Generate all chapters with parallel LLM calls, approve each, and auto-sync script speakers."""
    result = service.generate_batch_and_approve(story_id, chapter_ids, version_service=version_service)

    try:
        chars_data = character_service.get_characters(story_id)
        existing = {
            (p.get("character_name") or "").strip().lower()
            for profiles in (
                chars_data.get("created_major_character_profiles", []),
                chars_data.get("created_side_character_profiles", []),
            )
            for p in profiles
            if p.get("character_name")
        }
        all_speakers = _collect_script_speakers(story_id, registry)
        orphans = sorted(s for s in all_speakers if s not in _SKIP_SPEAKERS and s not in existing)
        sync_created: list[str] = []
        for speaker in orphans:
            character_service.create_side_character_profile(story_id=story_id, character_name=speaker, profile_data={})
            sync_created.append(speaker)
        result["sync_created"] = sync_created
        result["sync_count"] = len(sync_created)
    except Exception as exc:
        result["sync_error"] = str(exc)

    return ok(result)


@router.post("/fill-visuals-batch-all")
def fill_visuals_batch_all(
    story_id: str,
    body: FillVisualsAllRequest,
    service: ChapterScriptService = Depends(get_chapter_script_service),
    version_service: VersionService = Depends(get_version_service),
    llm: LLMService = Depends(get_llm_service),
):
    """Fill all chapters' panel visuals with parallel LLM calls, then sequentially apply+approve+snapshot."""
    result = service.fill_visuals_batch_all(
        story_id,
        body.chapter_ids,
        body.available_locations,
        llm_service=llm,
        version_service=version_service,
    )
    return ok(result)


@router.post("/approve")
def approve_script(
    story_id: str,
    chapter_id: str = Query(default=""),
    service: ChapterScriptService = Depends(get_chapter_script_service),
    version_service: VersionService = Depends(get_version_service),
):
    script_result = service.approve_script(story_id, chapter_id=chapter_id)
    # After approving the chapter script, create a version snapshot so the
    # approved chapter_script (and all other current files) are frozen into
    # version history.  This prevents generating the next chapter from
    # overwriting the previous one.
    try:
        candidate = version_service.create_simple_snapshot(story_id)
        version_id = candidate["version_id"]
        official = version_service.mark_official(story_id, version_id)
        script_result["created_version_id"] = version_id
        script_result["version_status"] = official.get("status", "official")
        script_result["sync_results"] = {
            "graph_sync": official.get("graph_sync"),
            "vector_sync": official.get("vector_sync"),
            "continuity_sync": official.get("continuity_sync"),
        }
    except Exception as exc:
        script_result["version_error"] = str(exc)
        script_result["version_warning"] = (
            "Chapter script approved but version snapshot failed. "
            "The script is saved but not frozen in version history."
        )
    return ok(script_result)
