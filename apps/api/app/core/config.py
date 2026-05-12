from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MANGA_",
        env_file=Path(__file__).resolve().parents[2] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    storage_root: Path = Path("storage/stories")
    registry_sqlite_path: Path = Path("storage/manga_registry.sqlite")
    template_dir: Path = Path(__file__).resolve().parents[1] / "templates"

    # Registry/database selection. SQLite remains the local smoke-test fallback;
    # PostgreSQL is the production target managed through Alembic migrations.
    registry_backend: str = "sqlite"  # sqlite | postgres
    database_url: str = "postgresql+psycopg://manga:manga@localhost:5432/manga_maker"
    alembic_config_path: Path = Path("alembic.ini")

    # LLM integration. If llm_enabled is false or no API key is set, the backend
    # uses the deterministic local fallback and stays fully runnable.
    llm_enabled: bool = False
    llm_provider: str = "openai"
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-4.1-mini"
    openai_base_url: str = "https://api.openai.com/v1"
    llm_timeout_seconds: float = 30.0
    llm_prompt_version: str = "llm_v0_1"

    # Auth/user ownership v0.1. Local/dev mode is permissive and assigns
    # requests to dev_user_id. Production can set auth_enabled=true and
    # require MANGA_DEV_API_KEY via Authorization: Bearer or X-Manga-API-Key.
    auth_enabled: bool = False
    dev_user_id: str = "dev_user"
    dev_user_email: str = "dev@example.local"
    dev_user_display_name: str = "Dev User"
    dev_api_key: SecretStr | None = None


    # Graph/vector integrations. When disabled or unavailable, services write
    # local projection/chunk logs so development and smoke tests still pass.
    neo4j_enabled: bool = False
    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: SecretStr | None = None
    neo4j_database: str = "neo4j"
    neo4j_timeout_seconds: float = 10.0

    qdrant_enabled: bool = False
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: SecretStr | None = None
    qdrant_timeout_seconds: float = 10.0
    qdrant_vector_size: int = 384

    # Frontend integration / CORS. Defaults support local Next.js dev server.
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.storage_root.mkdir(parents=True, exist_ok=True)
    settings.registry_sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return settings
