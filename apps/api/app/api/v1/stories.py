from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import get_current_user, require_story_access, UserContext
from app.main_dependencies import get_story_service
from app.models.api import CreateStoryRequest
from app.services.story_service import StoryService

router = APIRouter(prefix="/stories", tags=["stories"])


@router.post("")
def create_story(
    payload: CreateStoryRequest,
    user: UserContext = Depends(get_current_user),
    service: StoryService = Depends(get_story_service),
):
    return ok(service.create_story(title=payload.title, user_id=user.user_id))


@router.get("")
def list_stories(
    user: UserContext = Depends(get_current_user),
    service: StoryService = Depends(get_story_service),
):
    stories = service.list_stories(user_id=user.user_id)
    return ok(stories)


@router.delete("/{story_id}")
def delete_story(
    story_id: str,
    user: UserContext = Depends(get_current_user),
    service: StoryService = Depends(get_story_service),
):
    result = service.delete_story(story_id=story_id)
    return ok(result)


@router.get("/{story_id}/status")
def story_status(story_id: str, _access: None = Depends(require_story_access), service: StoryService = Depends(get_story_service)):
    return ok(service.get_status(story_id))


@router.get("/{story_id}/files/current")
def current_files(story_id: str, _access: None = Depends(require_story_access), service: StoryService = Depends(get_story_service)):
    return ok(service.get_current_files(story_id))


@router.get("/{story_id}/versions/{version_id}/manifest")
def version_manifest(story_id: str, version_id: str, _access: None = Depends(require_story_access), service: StoryService = Depends(get_story_service)):
    return ok(service.get_manifest(story_id, version_id))
