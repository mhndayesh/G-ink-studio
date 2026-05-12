from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_plot_workspace_service
from app.models.api import (
    PlotWorkspaceAICompleteRequest,
    PlotWorkspaceAICompletionDecisionRequest,
    PlotWorkspaceApproveRequest,
    PlotWorkspaceFreeWritingRequest,
    PlotWorkspaceQuestionAnswerRequest,
)
from app.services.plot_workspace_service import PlotWorkspaceService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/plot-workspace", tags=["plot-workspace"])


@router.get("")
def get_workspace(story_id: str, service: PlotWorkspaceService = Depends(get_plot_workspace_service)):
    return ok(service.get_workspace(story_id))


@router.post("/validate")
def validate_workspace(story_id: str, service: PlotWorkspaceService = Depends(get_plot_workspace_service)):
    return ok(service.validate_workspace(story_id))


@router.patch("/free-writing")
def save_free_writing(
    story_id: str,
    request: PlotWorkspaceFreeWritingRequest,
    service: PlotWorkspaceService = Depends(get_plot_workspace_service),
):
    return ok(service.save_free_writing(
        story_id=story_id,
        text=request.text,
        input_type=request.input_type,
        user_priority=request.user_priority,
        user_intent_notes=request.user_intent_notes,
        do_not_change_these_parts=request.do_not_change_these_parts,
    ))


@router.post("/ai-complete")
def ai_complete(
    story_id: str,
    request: PlotWorkspaceAICompleteRequest,
    service: PlotWorkspaceService = Depends(get_plot_workspace_service),
):
    return ok(service.ai_complete(story_id=story_id, expansion_mode=request.expansion_mode, text=request.text))


@router.post("/ai-complete/decision")
def decide_ai_completion(
    story_id: str,
    request: PlotWorkspaceAICompletionDecisionRequest,
    service: PlotWorkspaceService = Depends(get_plot_workspace_service),
):
    return ok(service.decide_ai_completion(story_id=story_id, decision=request.decision, edited_text=request.edited_text))


@router.post("/analyze")
def analyze(story_id: str, service: PlotWorkspaceService = Depends(get_plot_workspace_service)):
    return ok(service.analyze(story_id))


@router.get("/questions")
def get_questions(story_id: str, service: PlotWorkspaceService = Depends(get_plot_workspace_service)):
    return ok(service.get_questions(story_id))


@router.post("/questions/{question_id}/answer")
def answer_question(
    story_id: str,
    question_id: str,
    request: PlotWorkspaceQuestionAnswerRequest,
    service: PlotWorkspaceService = Depends(get_plot_workspace_service),
):
    return ok(service.answer_question(story_id=story_id, question_id=question_id, selected=request.selected, custom_answer=request.custom_answer))


@router.get("/confirmation")
def get_confirmation(story_id: str, service: PlotWorkspaceService = Depends(get_plot_workspace_service)):
    return ok(service.get_confirmation(story_id))


@router.post("/approve")
def approve(
    story_id: str,
    request: PlotWorkspaceApproveRequest,
    service: PlotWorkspaceService = Depends(get_plot_workspace_service),
    # NOTE(dev): EventPatchService and VersionService were removed from the
    # Writing Desk approve flow.  Per-chapter version creation now lives in the
    # Manga Script approve endpoint (chapter_script.py).  The Writing Desk is
    # a planning tool for arcs and story expansion — it marks the workspace as
    # reviewed but does NOT create SQLite events, patches, or version bundles.
):
    workspace_result = service.approve(story_id=story_id, decision=request.decision, custom_user_instruction=request.custom_user_instruction)
    if workspace_result.get("approved") is True:
        workspace_result["next_step"] = "done — proceed to Manga Script"
    return ok(workspace_result)
