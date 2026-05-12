from __future__ import annotations


def story_id_from_number(number: int) -> str:
    return f"story_{number:03d}"


def version_id_from_number(number: int) -> str:
    return f"v{number:03d}"


def file_id(story_id: str, version_id: str, file_type: str) -> str:
    return f"file_{story_id}_{version_id}_{file_type}"
