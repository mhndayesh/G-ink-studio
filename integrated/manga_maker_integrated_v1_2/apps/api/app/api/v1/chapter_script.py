from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_chapter_script_service, get_version_service
from app.models.api import ChapterScriptPatchRequest
from app.services.chapter_script_service import ChapterScriptService
from app.services.version_service import VersionService

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
