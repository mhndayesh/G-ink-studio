from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.errors import ok
from app.core.auth import require_story_access
from app.main_dependencies import get_graph_service
from app.services.graph_service import GraphService

router = APIRouter(dependencies=[Depends(require_story_access)], prefix="/stories/{story_id}/graph", tags=["graph"])


@router.post("/project-events")
def project_events(story_id: str, service: GraphService = Depends(get_graph_service)):
    return ok(service.project_events(story_id))


@router.get("/projections")
def projections(story_id: str, service: GraphService = Depends(get_graph_service)):
    return ok(service.list_projections(story_id))


@router.get("/web")
def web_graph(story_id: str, service: GraphService = Depends(get_graph_service)):
    return ok(service.get_web_graph(story_id))


@router.get("/status")
def status(story_id: str, service: GraphService = Depends(get_graph_service)):
    status_data = service.status()
    return ok({**status_data, "connected": status_data.get("can_connect", False)})
