from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter

from app.core.config import get_settings
from app.db.postgres import get_migration_info

router = APIRouter(prefix="/db", tags=["database"])


@router.get("/migration-info")
def migration_info():
    settings = get_settings()
    project_root = Path(__file__).resolve().parents[3]
    info = get_migration_info(settings=settings, project_root=project_root)
    return {
        "ok": True,
        "data": {
            "registry_backend": info.registry_backend,
            "database_url_configured": info.database_url_configured,
            "alembic_config_path": info.alembic_config_path,
            "migrations_path": info.migrations_path,
            "schema_sql_path": info.schema_sql_path,
            "has_initial_migration": info.has_initial_migration,
            "has_schema_sql": info.has_schema_sql,
            "production_target": "postgresql",
            "local_fallback": "sqlite",
        },
        "error": None,
    }
