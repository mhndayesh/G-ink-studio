from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_version_service
from app.services.version_service import VersionService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/versions", tags=["versions"])


@router.get("")
def list_versions(story_id: str, service: VersionService = Depends(get_version_service)):
    return ok(service.list_versions(story_id))


@router.get("/{version_id}")
def get_version(story_id: str, version_id: str, service: VersionService = Depends(get_version_service)):
    return ok(service.get_version(story_id, version_id))


@router.post("/create-from-approved-events")
def create_from_approved_events(story_id: str, service: VersionService = Depends(get_version_service)):
    return ok(service.create_candidate_from_approved_events(story_id))


@router.post("/{version_id}/mark-official")
def mark_official(story_id: str, version_id: str, service: VersionService = Depends(get_version_service)):
    return ok(service.mark_official(story_id, version_id))
