from __future__ import annotations

from enum import Enum


class StateType(str, Enum):
    template_state = "template_state"
    story_state = "story_state"


class VersionStatus(str, Enum):
    draft = "draft"
    candidate = "candidate"
    official = "official"
    archived = "archived"
    failed = "failed"


class FileType(str, Enum):
    master_story = "master_story"
    characters = "characters"
    plot_outline = "plot_outline"
    memory_system = "memory_system"
    plot_workspace = "plot_workspace"
    chapter_script = "chapter_script"
    version_manifest = "version_manifest"
