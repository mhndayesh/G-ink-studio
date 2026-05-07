from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_plot_outline_service
from app.models.api import (
    PlotArcOverviewPatchRequest,
    PlotChapterCreateRequest,
    PlotNarrativeStructureRequest,
    PlotRedoArcStructureRequest,
    PlotSceneCreateRequest,
    PlotStartWorkflowRequest,
)
from app.services.plot_outline_service import PlotOutlineService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/plot-outline", tags=["plot-outline"])


@router.get("")
def get_plot_outline(story_id: str, service: PlotOutlineService = Depends(get_plot_outline_service)):
    return ok(service.get_plot_outline(story_id))


@router.post("/validate")
def validate_plot_outline(story_id: str, service: PlotOutlineService = Depends(get_plot_outline_service)):
    return ok(service.validate_plot_outline(story_id))


@router.patch("/story-start-workflow")
def update_story_start_workflow(
    story_id: str,
    request: PlotStartWorkflowRequest,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.update_story_start_workflow(story_id=story_id, start_mode=request.start_mode, current_stage=request.current_stage))


@router.patch("/narrative-structure")
def update_narrative_structure(
    story_id: str,
    request: PlotNarrativeStructureRequest,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.update_narrative_structure(story_id=story_id, selected=request.selected, custom_structure=request.custom_structure))


@router.post("/redo-arc-structure")
def redo_arc_structure(
    story_id: str,
    request: PlotRedoArcStructureRequest,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.redo_arc_structure(
        story_id=story_id,
        selected=request.selected,
        custom_structure=request.custom_structure,
        preserve_arc_overview=request.preserve_arc_overview,
        clear_chapter_script=request.clear_chapter_script,
        confirmation=request.confirmation,
    ))


@router.patch("/arc-overview")
def patch_arc_overview(
    story_id: str,
    request: PlotArcOverviewPatchRequest,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.patch_arc_overview(story_id=story_id, target_branch=request.target_branch, operation=request.operation, value=request.value))


@router.post("/chapters")
def create_chapter(
    story_id: str,
    request: PlotChapterCreateRequest,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.create_chapter(story_id=story_id, chapter=request.model_dump(exclude_none=True)))


@router.post("/scenes")
def create_scene(
    story_id: str,
    request: PlotSceneCreateRequest,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.create_scene(story_id=story_id, scene=request.model_dump(exclude_none=True)))


@router.delete("/chapters/{chapter_id}")
def delete_chapter(
    story_id: str,
    chapter_id: str,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.delete_chapter(story_id=story_id, chapter_id=chapter_id))


@router.delete("/scenes/{scene_id}")
def delete_scene(
    story_id: str,
    scene_id: str,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    return ok(service.delete_scene(story_id=story_id, scene_id=scene_id))


@router.post("/integrity-lock/advance")
def advance_integrity_lock(
    story_id: str,
    request: dict,
    service: PlotOutlineService = Depends(get_plot_outline_service),
):
    chapter_number = request.get("chapter_number")
    if not isinstance(chapter_number, int):
        from app.core.errors import MangaMakerError
        raise MangaMakerError("VALIDATION_ERROR", "chapter_number (int) is required", status_code=400)
    return ok(service.advance_integrity_lock(story_id=story_id, chapter_number=chapter_number))
