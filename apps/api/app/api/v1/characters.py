from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_character_service, get_registry
from app.repositories.sqlite_registry import SQLiteRegistry
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


_SKIP_SPEAKERS = {"narrator", "narration", "background character", "?", ""}


def _collect_script_speakers(story_id: str, registry: SQLiteRegistry) -> set[str]:
    """Gather dialogue speaker_names from the latest chapter-script per chapter.

    Uses the same deduplication as _validate_export: latest version per chapter_id
    wins, so speakers from superseded (stale) snapshots are never included.
    """
    rows = registry.list_files_across_versions(story_id, "chapter_script")
    by_chapter: dict[str, dict] = {}
    for row in rows:
        data = row.get("json_copy", {}) or {}
        if not data.get("pages"):
            continue
        ch_id = ((data.get("chapter_metadata") or {}).get("chapter_id") or "").strip()
        if not ch_id:
            continue
        by_chapter[ch_id] = data  # latest version wins (rows ordered ASC)
    # Also include current working script (may not be approved yet).
    current = registry.get_current_file(story_id, "chapter_script")
    if current:
        data = current.get("json_copy", {}) or {}
        ch_id = ((data.get("chapter_metadata") or {}).get("chapter_id") or "").strip()
        if ch_id and data.get("pages"):
            by_chapter[ch_id] = data

    speakers: set[str] = set()
    for data in by_chapter.values():
        for page in data.get("pages", []) or []:
            for panel in page.get("panels", []) or []:
                for d in panel.get("dialogue", []) or []:
                    name = (d.get("speaker_name") or d.get("speaker") or d.get("speaker_id") or "").strip()
                    if name:
                        speakers.add(name.lower())
    return speakers


@router.post("/sync-script-speakers")
def sync_script_speakers(
    story_id: str,
    service: CharacterService = Depends(get_character_service),
    registry: SQLiteRegistry = Depends(get_registry),
):
    """Create stub side-character profiles for any dialogue speaker that has no profile.

    Safe to call multiple times — already-profiled speakers are skipped.
    Returns the list of newly created profile names.
    """
    chars_data = service.get_characters(story_id)
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
    orphans = sorted(
        s for s in all_speakers
        if s not in _SKIP_SPEAKERS and s not in existing
    )

    created: list[str] = []
    already_present: list[str] = []
    for speaker in orphans:
        service.create_side_character_profile(
            story_id=story_id,
            character_name=speaker,
            profile_data={},
        )
        created.append(speaker)

    return ok({"created": created, "already_present": list(existing & all_speakers), "count": len(created)})
