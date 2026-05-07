from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header

from app.core.config import get_settings
from app.core.errors import MangaMakerError
from app.main_dependencies import get_registry
from app.repositories.sqlite_registry import SQLiteRegistry


@dataclass(frozen=True)
class UserContext:
    user_id: str
    email: str | None = None
    display_name: str | None = None
    auth_mode: str = "dev"


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.strip().split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1].strip()
    return None


def get_current_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
    x_manga_api_key: str | None = Header(default=None, alias="X-Manga-API-Key"),
    x_manga_user_id: str | None = Header(default=None, alias="X-Manga-User-Id"),
    registry: SQLiteRegistry = Depends(get_registry),
) -> UserContext:
    settings = get_settings()

    if not settings.auth_enabled:
        user_id = x_manga_user_id or settings.dev_user_id
        user = UserContext(
            user_id=user_id,
            email=settings.dev_user_email if user_id == settings.dev_user_id else None,
            display_name=settings.dev_user_display_name if user_id == settings.dev_user_id else user_id,
            auth_mode="dev",
        )
        registry.ensure_user(user_id=user.user_id, email=user.email, display_name=user.display_name)
        return user

    supplied_key = x_manga_api_key or _extract_bearer(authorization)
    configured = settings.dev_api_key.get_secret_value() if settings.dev_api_key else None
    if not configured:
        raise MangaMakerError("AUTH_NOT_CONFIGURED", "Auth is enabled but MANGA_DEV_API_KEY is not configured", status_code=500)
    if supplied_key != configured:
        raise MangaMakerError("UNAUTHORIZED", "Missing or invalid API key", status_code=401)

    # NOTE: API-key auth is intentionally single-tenant — every authenticated
    # caller is mapped to settings.dev_user_id. X-Manga-User-Id is honored only
    # in dev mode (auth_enabled=false). Multi-tenant mapping (per-key user) is
    # not implemented and would require a key→user table.
    user = UserContext(
        user_id=settings.dev_user_id,
        email=settings.dev_user_email,
        display_name=settings.dev_user_display_name,
        auth_mode="api_key",
    )
    registry.ensure_user(user_id=user.user_id, email=user.email, display_name=user.display_name)
    return user


def require_story_access(
    story_id: str,
    user: UserContext = Depends(get_current_user),
    registry: SQLiteRegistry = Depends(get_registry),
) -> None:
    story = registry.get_story(story_id)
    if not story:
        raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
    owner_id = story.get("user_id")
    if owner_id and owner_id != user.user_id:
        raise MangaMakerError("FORBIDDEN", f"User {user.user_id} does not own story {story_id}", status_code=403)
