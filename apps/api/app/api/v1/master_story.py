from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_master_story_service
from app.models.api import MasterStoryTemplatePatchRequest
from app.services.master_story_service import MasterStoryService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/master-story", tags=["master-story"])


@router.get("")
def get_master_story(story_id: str, service: MasterStoryService = Depends(get_master_story_service)):
    return ok(service.get_master_story(story_id))


@router.patch("/template")
def patch_master_story_template(
    story_id: str,
    payload: MasterStoryTemplatePatchRequest,
    service: MasterStoryService = Depends(get_master_story_service),
):
    return ok(
        service.patch_template(
            story_id=story_id,
            target_branch=payload.target_branch,
            operation=payload.operation,
            value=payload.value,
        )
    )


@router.post("/validate")
def validate_master_story(story_id: str, service: MasterStoryService = Depends(get_master_story_service)):
    return ok(service.validate_master_story(story_id))
