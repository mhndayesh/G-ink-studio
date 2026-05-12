from __future__ import annotations

import logging
import sqlite3

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.health import router as health_router
from app.api.v1.stories import router as stories_router
from app.api.v1.master_story import router as master_story_router
from app.api.v1.characters import router as characters_router
from app.api.v1.plot_outline import router as plot_outline_router
from app.api.v1.plot_workspace import router as plot_workspace_router
from app.api.v1.events import router as events_router
from app.api.v1.versions import router as versions_router
from app.api.v1.chapter_script import router as chapter_script_router
from app.api.v1.continuity import router as continuity_router
from app.api.v1.graph import router as graph_router
from app.api.v1.vector import router as vector_router
from app.api.v1.llm import router as llm_router
from app.api.v1.db import router as db_router
from app.api.v1.auth import router as auth_router
from app.api.v1.ai import router as ai_router
from app.api.v1.export import router as export_router
from app.api.v1.locations import router as locations_router
from app.core.errors import MangaMakerError, manga_error_handler
from app.core.config import get_settings
from starlette.middleware.base import BaseHTTPMiddleware
import time

settings = get_settings()
app = FastAPI(title="Manga Maker Backend Foundation", version="1.2.0")

_req_logger = logging.getLogger("manga.request")

class RequestLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        ms = int((time.monotonic() - start) * 1000)
        _req_logger.info("%s %s → %d (%dms)", request.method, request.url.path, response.status_code, ms)
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple in-memory rate limiter: 100 requests per 60 seconds per client IP."""
    _buckets: dict[str, list[float]] = {}

    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        now = time.monotonic()
        if path.startswith("/api/v1/health"):
            return await call_next(request)
        bucket = self._buckets.setdefault(client_ip, [])
        bucket[:] = [t for t in bucket if now - t < 60.0]
        if len(bucket) >= 100:
            return JSONResponse(
                status_code=429,
                content={"ok": False, "data": None, "error": {"code": "RATE_LIMITED", "message": "Too many requests. Please slow down."}},
            )
        bucket.append(now)
        response = await call_next(request)
        return response


app.add_middleware(RequestLogMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_exception_handler(MangaMakerError, manga_error_handler)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    parts: list[str] = []
    for err in errors:
        loc = ".".join(str(p) for p in err.get("loc", []) if p not in ("body",))
        msg = err.get("msg", "invalid")
        parts.append(f"{loc}: {msg}" if loc else msg)
    summary = "; ".join(parts) or "Request validation failed"
    _req_logger.warning("422 %s %s — %s", request.method, request.url.path, summary)
    return JSONResponse(
        status_code=422,
        content={
            "ok": False,
            "data": None,
            "error": {"code": "VALIDATION_ERROR", "message": summary, "details": errors},
        },
    )


@app.exception_handler(sqlite3.IntegrityError)
async def sqlite_integrity_handler(request: Request, exc: sqlite3.IntegrityError):
    msg = str(exc) or "UNIQUE constraint violation"
    return JSONResponse(
        status_code=409,
        content={
            "ok": False,
            "data": None,
            "error": {"code": "UNIQUE_CONFLICT", "message": msg},
        },
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    _req_logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "data": None,
            "error": {"code": "INTERNAL_ERROR", "message": "An internal error occurred. Please check the server logs."},
        },
    )

app.include_router(health_router, prefix="/api/v1")
app.include_router(auth_router, prefix="/api/v1")
app.include_router(stories_router, prefix="/api/v1")
app.include_router(master_story_router, prefix="/api/v1")
app.include_router(characters_router, prefix="/api/v1")
app.include_router(plot_outline_router, prefix="/api/v1")
app.include_router(plot_workspace_router, prefix="/api/v1")
app.include_router(events_router, prefix="/api/v1")
app.include_router(versions_router, prefix="/api/v1")
app.include_router(chapter_script_router, prefix="/api/v1")
app.include_router(continuity_router, prefix="/api/v1")
app.include_router(graph_router, prefix="/api/v1")
app.include_router(vector_router, prefix="/api/v1")
app.include_router(llm_router, prefix="/api/v1")
app.include_router(db_router, prefix="/api/v1")
app.include_router(ai_router, prefix="/api/v1")
app.include_router(locations_router, prefix="/api/v1")
app.include_router(export_router, prefix="/api/v1")
