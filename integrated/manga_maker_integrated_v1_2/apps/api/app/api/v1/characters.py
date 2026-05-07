from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_character_service
from app.models.api import (
    CharacterProfileCreateRequest,
    CharacterProfileCreateResponse,
    SideCharacterProfileCreateRequest,
    CharacterProfileUpdateRequest,
    SideCharacterProfileUpdateRequest,
    CharacterStructureRequest,
    CharacterStructureResponse,
    CharactersResponse,
    RelationshipMapActivateResponse,
    ValidationResponse,
)
from app.services.character_service import CharacterService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/characters", tags=["characters"])


@router.get("")
def get_characters(story_id: str, service: CharacterService = Depends(get_character_service)):
    return ok(service.get_characters(story_id))


@router.post("/validate")
def validate_characters(story_id: str, service: CharacterService = Depends(get_character_service)):
    return ok(service.validate_characters(story_id))


@router.patch("/structure")
def update_structure(story_id: str, request: CharacterStructureRequest, service: CharacterService = Depends(get_character_service)):
    return ok(service.update_structure(
        story_id=story_id,
        selected=request.selected,
        custom_main_character_structure=request.custom_main_character_structure,
        requested_major_profiles=request.requested_major_profiles,
    ))


@router.post("/profiles")
def create_profile(story_id: str, request: CharacterProfileCreateRequest, service: CharacterService = Depends(get_character_service)):
    return ok(service.create_profile(
        story_id=story_id,
        profile_id=request.profile_id,
        character_name=request.character_name,
        profile_data=request.profile_data,
    ))


@router.post("/side-profiles")
def create_side_profile(story_id: str, request: SideCharacterProfileCreateRequest, service: CharacterService = Depends(get_character_service)):
    return ok(service.create_side_character_profile(
        story_id=story_id,
        character_name=request.character_name,
        profile_data=request.profile_data,
    ))


@router.patch("/profiles/{profile_id}")
def update_profile(
    story_id: str,
    profile_id: str,
    request: CharacterProfileUpdateRequest,
    service: CharacterService = Depends(get_character_service),
):
    return ok(service.update_profile(
        story_id=story_id,
        profile_id=profile_id,
        character_name=request.character_name,
        profile_data=request.profile_data,
    ))


@router.patch("/side-profiles/{profile_id}")
def update_side_profile(
    story_id: str,
    profile_id: str,
    request: SideCharacterProfileUpdateRequest,
    service: CharacterService = Depends(get_character_service),
):
    return ok(service.update_side_character_profile(
        story_id=story_id,
        profile_id=profile_id,
        character_name=request.character_name,
        profile_data=request.profile_data,
    ))


@router.delete("/profiles/{profile_id}")
def delete_profile(
    story_id: str,
    profile_id: str,
    service: CharacterService = Depends(get_character_service),
):
    return ok(service.delete_profile(story_id=story_id, profile_id=profile_id))


@router.delete("/side-profiles/{profile_id}")
def delete_side_profile(
    story_id: str,
    profile_id: str,
    service: CharacterService = Depends(get_character_service),
):
    return ok(service.delete_side_profile(story_id=story_id, profile_id=profile_id))


@router.get("/check-conflicts")
def check_conflicts(
    story_id: str,
    profile_id: str,
    new_name: str | None = None,
    service: CharacterService = Depends(get_character_service),
):
    return ok(service.check_character_conflicts(
        story_id=story_id,
        profile_id=profile_id,
        new_name=new_name,
    ))


@router.post("/relationship-map/activate")
def activate_relationship_map(story_id: str, service: CharacterService = Depends(get_character_service)):
    return ok(service.activate_relationship_map(story_id))
