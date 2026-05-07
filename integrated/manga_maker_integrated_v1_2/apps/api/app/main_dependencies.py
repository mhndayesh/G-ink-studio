from __future__ import annotations

from functools import lru_cache

from app.core.config import get_settings
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.validation_service import ValidationService
from app.services.snapshot_service import SnapshotService
from app.services.story_service import StoryService
from app.services.master_story_service import MasterStoryService
from app.services.character_service import CharacterService
from app.services.plot_outline_service import PlotOutlineService
from app.services.plot_workspace_service import PlotWorkspaceService
from app.services.event_patch_service import EventPatchService
from app.services.version_service import VersionService
from app.services.chapter_script_service import ChapterScriptService
from app.services.continuity_service import ContinuityService
from app.services.graph_service import GraphService
from app.services.vector_service import VectorService
from app.services.llm_service import LLMService


@lru_cache
def get_registry() -> SQLiteRegistry:
    settings = get_settings()
    return SQLiteRegistry(settings.registry_sqlite_path)


@lru_cache
def get_validation_service() -> ValidationService:
    return ValidationService()


@lru_cache
def get_snapshot_service() -> SnapshotService:
    settings = get_settings()
    return SnapshotService(storage_root=settings.storage_root, template_dir=settings.template_dir, validator=get_validation_service())


@lru_cache
def get_story_service() -> StoryService:
    return StoryService(registry=get_registry(), snapshot_service=get_snapshot_service())


@lru_cache
def get_master_story_service() -> MasterStoryService:
    return MasterStoryService(registry=get_registry(), snapshot_service=get_snapshot_service(), validator=get_validation_service())


@lru_cache
def get_character_service() -> CharacterService:
    return CharacterService(registry=get_registry(), snapshot_service=get_snapshot_service(), validator=get_validation_service())


@lru_cache
def get_plot_outline_service() -> PlotOutlineService:
    return PlotOutlineService(registry=get_registry(), snapshot_service=get_snapshot_service(), validator=get_validation_service())


@lru_cache
def get_plot_workspace_service() -> PlotWorkspaceService:
    return PlotWorkspaceService(registry=get_registry(), snapshot_service=get_snapshot_service(), validator=get_validation_service(), llm_service=get_llm_service())


@lru_cache
def get_event_patch_service() -> EventPatchService:
    return EventPatchService(registry=get_registry(), snapshot_service=get_snapshot_service(), validator=get_validation_service())


@lru_cache
def get_version_service() -> VersionService:
    return VersionService(
        registry=get_registry(), 
        snapshot_service=get_snapshot_service(), 
        validator=get_validation_service(),
        graph_service=get_graph_service(),
        vector_service=get_vector_service(),
        continuity_service=get_continuity_service(),
    )


@lru_cache
def get_chapter_script_service() -> ChapterScriptService:
    return ChapterScriptService(
        registry=get_registry(),
        snapshot_service=get_snapshot_service(),
        validator=get_validation_service(),
        llm_service=get_llm_service(),
    )


@lru_cache
def get_continuity_service() -> ContinuityService:
    return ContinuityService(registry=get_registry(), snapshot_service=get_snapshot_service(), validator=get_validation_service())


@lru_cache
def get_graph_service() -> GraphService:
    return GraphService(registry=get_registry(), settings=get_settings())


@lru_cache
def get_vector_service() -> VectorService:
    return VectorService(registry=get_registry(), settings=get_settings())


@lru_cache
def get_llm_service() -> LLMService:
    return LLMService(settings=get_settings(), registry=get_registry())
