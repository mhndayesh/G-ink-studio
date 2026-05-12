from __future__ import annotations

from typing import Any, Optional
from pydantic import BaseModel, model_validator


class LinkedFiles(BaseModel):
    master_story_file: str = "master_story.json"
    characters_file: str = "characters.json"
    plot_outline_file: str = "plot_outline.json"
    memory_system_file: str = "memory_system.json"
    plot_workspace_file: Optional[str] = None
    chapter_script_output_file: Optional[str] = None
    chapter_script_file: Optional[str] = None

    @model_validator(mode="after")
    def validate_names(self):
        expected = {
            "master_story_file": "master_story.json",
            "characters_file": "characters.json",
            "plot_outline_file": "plot_outline.json",
            "memory_system_file": "memory_system.json",
        }
        for attr, value in expected.items():
            if getattr(self, attr) != value:
                raise ValueError(f"{attr} must be {value}")
        return self


class VersionManifest(BaseModel):
    story_id: str
    version_id: str
    previous_version_id: str | None = None
    arc_id: str | None = None
    chapter_id: str | None = None
    state_type: str = "template_state"
    files: dict[str, str]
    working_files: dict[str, str]
    created_from_events: list[str] = []
    created_at: str

    @model_validator(mode="after")
    def validate_manifest_files(self):
        required = {
            "master_story": "master_story.json",
            "characters": "characters.json",
            "plot_outline": "plot_outline.json",
            "memory_system": "memory_system.json",
        }
        for key, filename in required.items():
            if self.files.get(key) != filename:
                raise ValueError(f"manifest file {key} must be {filename}")
        if self.working_files.get("plot_workspace") != "plot_workspace.json":
            raise ValueError("plot_workspace working file must be plot_workspace.json")
        if self.working_files.get("chapter_script") != "chapter_script.json":
            raise ValueError("chapter_script working file must be chapter_script.json")
        return self


class StoryFileRecord(BaseModel):
    file_id: str
    story_id: str
    version_id: str
    file_type: str
    official_filename: str
    storage_path: str
    state_type: str
    checksum: str
    json_copy: dict[str, Any]
