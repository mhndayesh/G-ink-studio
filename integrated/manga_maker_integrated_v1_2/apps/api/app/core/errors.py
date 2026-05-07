from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse


class MangaMakerError(Exception):
    def __init__(self, code: str, message: str, details: dict | None = None, status_code: int = 400):
        self.code = code
        self.message = message
        self.details = details or {}
        self.status_code = status_code
        super().__init__(message)


async def manga_error_handler(_: Request, exc: MangaMakerError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"ok": False, "data": None, "error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


def ok(data: dict | list | str | int | None = None) -> dict:
    return {"ok": True, "data": data if data is not None else {}, "error": None}
