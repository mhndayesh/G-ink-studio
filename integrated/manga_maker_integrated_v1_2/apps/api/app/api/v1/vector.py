from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_vector_service
from app.services.vector_service import VectorService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/vector", tags=["vector"])


@router.post("/upsert-current-memory")
def upsert_current(story_id: str, service: VectorService = Depends(get_vector_service)):
    return ok(service.upsert_current_memory(story_id))


@router.get("/chunks")
def chunks(story_id: str, service: VectorService = Depends(get_vector_service)):
    return ok(service.list_chunks(story_id))


@router.get("/status")
def status(story_id: str, service: VectorService = Depends(get_vector_service)):
    status_data = service.status()
    return ok({**status_data, "connected": status_data.get("can_connect", False)})
