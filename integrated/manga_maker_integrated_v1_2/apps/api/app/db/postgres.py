from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PostgresMigrationInfo:
    """Lightweight migration metadata that does not require SQLAlchemy at import time.

    The actual production database is managed by Alembic. This object is used by
    health/admin endpoints and smoke tests so the app can still run in local
    SQLite fallback mode without installing or connecting to PostgreSQL.
    """

    database_url_configured: bool
    registry_backend: str
    alembic_config_path: str
    migrations_path: str
    schema_sql_path: str
    has_initial_migration: bool
    has_schema_sql: bool


def get_migration_info(*, settings: Any, project_root: Path) -> PostgresMigrationInfo:
    alembic_config = project_root / "alembic.ini"
    migrations_path = project_root / "migrations"
    schema_sql_path = project_root / "infra" / "postgres" / "schema.sql"
    initial_migration = migrations_path / "versions" / "0001_initial_story_state_engine.py"

    return PostgresMigrationInfo(
        database_url_configured=bool(getattr(settings, "database_url", "")),
        registry_backend=str(getattr(settings, "registry_backend", "sqlite")),
        alembic_config_path=str(alembic_config),
        migrations_path=str(migrations_path),
        schema_sql_path=str(schema_sql_path),
        has_initial_migration=initial_migration.exists(),
        has_schema_sql=schema_sql_path.exists(),
    )
