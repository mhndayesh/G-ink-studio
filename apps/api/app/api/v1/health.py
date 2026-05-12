from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends
from app.core.config import get_settings
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.graph_service import GraphService
from app.services.vector_service import VectorService
from app.core.errors import ok

router = APIRouter()


def _check_sqlite(path: Path) -> dict:
    try:
        conn = sqlite3.connect(str(path))
        conn.execute("SELECT 1")
        conn.close()
        return {"enabled": True, "path": str(path), "status": "connected"}
    except Exception as exc:
        return {"enabled": True, "path": str(path), "status": f"error: {exc}"}


def _get_graph_status(settings):
    try:
        registry = SQLiteRegistry(settings.registry_sqlite_path)
        gs = GraphService(registry=registry, settings=settings)
        return gs.status()
    except Exception as exc:
        return {"enabled": bool(settings.neo4j_enabled), "can_connect": False, "fallback_mode": True, "error": str(exc)}


def _get_vector_status(settings):
    try:
        registry = SQLiteRegistry(settings.registry_sqlite_path)
        vs = VectorService(registry=registry, settings=settings)
        return vs.status()
    except Exception as exc:
        return {"enabled": bool(settings.qdrant_enabled), "can_connect": False, "fallback_mode": True, "error": str(exc)}


@router.get("/health")
def health():
    settings = get_settings()
    sqlite_status = _check_sqlite(settings.registry_sqlite_path)
    neo4j_status = _get_graph_status(settings)
    qdrant_status = _get_vector_status(settings)

    return ok({
        "status": "ok",
        "service": "manga-maker-api",
        "phase": "backend-foundation-v1.2",
        "databases": {
            "sqlite": sqlite_status,
            "neo4j": neo4j_status,
            "qdrant": qdrant_status,
        },
    })
