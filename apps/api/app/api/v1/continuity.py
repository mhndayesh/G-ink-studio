from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_continuity_service
from app.models.api import ContinuityCheckRequest
from app.services.continuity_service import ContinuityService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/continuity", tags=["continuity"])


@router.post("/check-current")
def check_current(story_id: str, service: ContinuityService = Depends(get_continuity_service)):
    return ok(service.check_current(story_id))


@router.post("/check-version")
def check_version(story_id: str, request: ContinuityCheckRequest, service: ContinuityService = Depends(get_continuity_service)):
    version_id = request.version_id or ""
    if not version_id:
        return ok(service.check_current(story_id))
    return ok(service.check_version(story_id, version_id))


@router.get("/reports")
def reports(story_id: str, service: ContinuityService = Depends(get_continuity_service)):
    return ok(service.list_reports(story_id))
