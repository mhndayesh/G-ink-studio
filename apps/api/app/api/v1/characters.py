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
from app.services.llm_service import LLMService
from app.main_dependencies import get_llm_service

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


@router.post("/auto-generate-side")
def auto_generate_side_cast(
    story_id: str,
    service: CharacterService = Depends(get_character_service),
    llm: LLMService = Depends(get_llm_service),
    registry: SQLiteRegistry = Depends(get_registry),
):
    """Analyse full story context and generate fully-formed side character profiles using the LLM.

    Creates as many profiles as the story logically implies — no fixed count.
    Skips any name that already exists in major or side profiles.
    """
    context: dict = {}
    for file_type in ["master_story", "characters", "plot_outline", "plot_workspace", "chapter_script"]:
        rec = registry.get_current_file(story_id, file_type)
        if rec:
            context[file_type] = rec.get("json_copy", {})

    result = llm.generate_fields(
        story_id=story_id,
        page="side",
        target_fields=["auto_side_cast"],
        partial_input={},
        context=context,
        generation_hints={"auto_generate": True},
    )

    candidates = (result.get("generated_fields") or {}).get("auto_side_cast", [])
    if not isinstance(candidates, list):
        candidates = []

    chars_data = service.get_characters(story_id)
    existing_names: set[str] = {
        (p.get("character_name") or "").strip().lower()
        for profiles in (
            chars_data.get("created_major_character_profiles", []),
            chars_data.get("created_side_character_profiles", []),
        )
        for p in profiles
        if p.get("character_name")
    }
    # Pre-split existing names into first-name tokens for fuzzy blocking
    existing_first_tokens: set[str] = {n.split()[0] for n in existing_names if n.split()}

    def _name_collides(candidate: str) -> bool:
        low = candidate.lower()
        if low in existing_names:
            return True
        # Block if candidate is a substring of any existing name or vice-versa
        for ex in existing_names:
            if low in ex or ex in low:
                return True
        # Block if first token matches any existing first token (catches "Kinji" vs "Kinji Matsuda")
        first = low.split()[0] if low.split() else ""
        if first and first in existing_first_tokens:
            return True
        return False

    created: list[str] = []
    skipped: list[str] = []
    for char in candidates:
        if not isinstance(char, dict):
            continue
        name = (char.get("character_name") or "").strip()
        if not name:
            continue
        if _name_collides(name):
            skipped.append(name)
            continue
        profile_data = {k: v for k, v in char.items() if k != "character_name"}
        service.create_side_character_profile(
            story_id=story_id,
            character_name=name,
            profile_data=profile_data,
        )
        created.append(name)
        existing_names.add(name.lower())

    return ok({
        "created": created,
        "skipped": skipped,
        "count": len(created),
        "used_fallback": result.get("used_fallback", False),
        "warnings": result.get("warnings", []),
    })


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
