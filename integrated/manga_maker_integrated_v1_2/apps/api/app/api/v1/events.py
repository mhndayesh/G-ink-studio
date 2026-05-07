from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_event_patch_service
from app.services.event_patch_service import EventPatchService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}", tags=["events-patches"])


@router.get("/events")
def get_events(story_id: str, service: EventPatchService = Depends(get_event_patch_service)):
    return ok(service.get_events(story_id))


@router.get("/patches")
def get_patches(story_id: str, service: EventPatchService = Depends(get_event_patch_service)):
    return ok(service.get_patches(story_id))


@router.post("/events/from-approved-workspace")
def create_from_approved_workspace(story_id: str, service: EventPatchService = Depends(get_event_patch_service)):
    return ok(service.create_from_approved_workspace(story_id))
