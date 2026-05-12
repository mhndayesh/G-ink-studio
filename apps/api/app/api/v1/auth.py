from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.auth import UserContext, get_current_user
from app.core.config import get_settings
from app.core.errors import ok

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def me(user: UserContext = Depends(get_current_user)):
    settings = get_settings()
    return ok({
        "user_id": user.user_id,
        "email": user.email,
        "display_name": user.display_name,
        "auth_mode": user.auth_mode,
        "auth_enabled": settings.auth_enabled,
    })
