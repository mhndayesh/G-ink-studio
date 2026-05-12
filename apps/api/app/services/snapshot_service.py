from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.ids import file_id
from app.models.files import VersionManifest
from app.services.validation_service import ValidationService


class SnapshotService:
    official_files = {
        "master_story": "master_story.json",
        "characters": "characters.json",
        "plot_outline": "plot_outline.json",
        "memory_system": "memory_system.json",
    }
    working_files = {
        "plot_workspace": "plot_workspace.json",
        "chapter_script": "chapter_script.json",
    }

    def __init__(self, *, storage_root: Path, template_dir: Path, validator: ValidationService):
        self.storage_root = storage_root
        self.template_dir = template_dir
        self.validator = validator

    def _load_template(self, filename: str) -> dict[str, Any]:
        with (self.template_dir / filename).open("r", encoding="utf-8") as f:
            return json.load(f)

    def _prepare_template(self, data: dict[str, Any], *, story_id: str, version_id: str, title: str) -> dict[str, Any]:
        prepared = copy.deepcopy(data)
        prepared["story_id"] = story_id
        prepared["version_id"] = version_id
        prepared["state_type"] = "template_state"
        if "title" in prepared:
            prepared["title"] = title
        if "story_title" in prepared:
            prepared["story_title"] = title
        return prepared

    def _write_json(self, path: Path, data: dict[str, Any]) -> str:
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(data, ensure_ascii=False, indent=2)
        path.write_text(text + "\n", encoding="utf-8")
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def create_v001_bundle(self, *, story_id: str, version_id: str, title: str) -> tuple[dict[str, str], list[dict[str, Any]]]:
        base = self.storage_root / story_id
        version_dir = base / "versions" / version_id
        workspace_dir = base / "workspace"
        scripts_dir = base / "scripts"
        created_paths: dict[str, str] = {}
        records: list[dict[str, Any]] = []

        for file_type, filename in self.official_files.items():
            data = self._prepare_template(self._load_template(filename), story_id=story_id, version_id=version_id, title=title)
            self.validator.validate_story_file(file_type=file_type, data=data, story_id=story_id, version_id=version_id)
            path = version_dir / filename
            checksum = self._write_json(path, data)
            created_paths[file_type] = str(path)
            records.append({
                "file_id": file_id(story_id, version_id, file_type),
                "story_id": story_id,
                "version_id": version_id,
                "file_type": file_type,
                "official_filename": filename,
                "storage_path": str(path),
                "state_type": "template_state",
                "checksum": checksum,
                "json_copy": data,
            })

        for file_type, filename in self.working_files.items():
            data = self._prepare_template(self._load_template(filename), story_id=story_id, version_id=version_id, title=title)
            self.validator.validate_story_file(file_type=file_type, data=data, story_id=story_id, version_id=version_id)
            path = (workspace_dir / filename) if file_type == "plot_workspace" else (scripts_dir / filename)
            checksum = self._write_json(path, data)
            created_paths[file_type] = str(path)
            records.append({
                "file_id": file_id(story_id, version_id, file_type),
                "story_id": story_id,
                "version_id": version_id,
                "file_type": file_type,
                "official_filename": filename,
                "storage_path": str(path),
                "state_type": "template_state",
                "checksum": checksum,
                "json_copy": data,
            })

        manifest = VersionManifest(
            story_id=story_id,
            version_id=version_id,
            previous_version_id=None,
            state_type="template_state",
            files=self.official_files,
            working_files=self.working_files,
            created_from_events=[],
            created_at=datetime.now(timezone.utc).isoformat(),
        ).model_dump()
        manifest_path = version_dir / "version_manifest.json"
        checksum = self._write_json(manifest_path, manifest)
        created_paths["version_manifest"] = str(manifest_path)
        records.append({
            "file_id": file_id(story_id, version_id, "version_manifest"),
            "story_id": story_id,
            "version_id": version_id,
            "file_type": "version_manifest",
            "official_filename": "version_manifest.json",
            "storage_path": str(manifest_path),
            "state_type": "template_state",
            "checksum": checksum,
            "json_copy": manifest,
        })
        return created_paths, records

    def write_existing_json(self, *, path: str, data: dict[str, Any]) -> str:
        return self._write_json(Path(path), data)
