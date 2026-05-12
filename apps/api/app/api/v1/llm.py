from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.main_dependencies import get_llm_service
from app.services.llm_service import LLMService

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/status")
def llm_status(service: LLMService = Depends(get_llm_service)):
    return ok(service.status())


@router.get("/runs")
def list_llm_runs(story_id: str | None = None, service: LLMService = Depends(get_llm_service)):
    return ok(service.registry.list_llm_runs(story_id=story_id))
