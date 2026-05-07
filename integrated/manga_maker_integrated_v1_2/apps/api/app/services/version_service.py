from __future__ import annotations

import copy
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.errors import MangaMakerError
from app.core.ids import file_id, version_id_from_number
from app.models.files import VersionManifest
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService
from app.services.graph_service import GraphService
from app.services.vector_service import VectorService
from app.services.continuity_service import ContinuityService


class VersionService:
    """Creates synchronized candidate bundles from approved events and patches.

    v0.1 rule: copy the current official/working files, apply approved JSON patches
    to the copied official files, write vNext, and leave the previous version files untouched.
    """

    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService, validator: ValidationService, graph_service: GraphService | None = None, vector_service: VectorService | None = None, continuity_service: ContinuityService | None = None):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator
        self.graph_service = graph_service
        self.vector_service = vector_service
        self.continuity_service = continuity_service

    def list_versions(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        # Dev registry has no dedicated list method yet; derive from visible files/known version rows via direct helper.
        versions = []
        number = 1
        while True:
            vid = version_id_from_number(number)
            version = self.registry.get_version(story_id, vid)
            if not version:
                break
            versions.append(version)
            number += 1
        return {"story_id": story_id, "current_version_id": story["current_version_id"], "versions": versions, "count": len(versions)}

    def get_version(self, story_id: str, version_id: str) -> dict[str, Any]:
        version = self.registry.get_version(story_id, version_id)
        if not version:
            raise MangaMakerError("VERSION_NOT_FOUND", f"Version {version_id} not found", status_code=404)
        files = self.registry.get_files_for_version(story_id, version_id)
        return {
            "version": version,
            "files": {row["file_type"]: row["official_filename"] for row in files},
            "paths": {row["file_type"]: row["storage_path"] for row in files},
        }

    def create_candidate_from_approved_events(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)

        current_version = story["current_version_id"]
        events = [e for e in self.registry.get_story_events(story_id) if e.get("approval_status") == "approved" and not e.get("version_to")]
        patches = [p for p in self.registry.get_json_patches(story_id) if p.get("approval_status") == "approved" and not p.get("applied_version_id")]
        if not events:
            raise MangaMakerError("NO_APPROVED_EVENTS", "No approved unapplied events found for version creation.")
        if not patches:
            raise MangaMakerError("NO_APPROVED_PATCHES", "No approved unapplied JSON patches found for version creation.")

        next_number = self.registry.next_version_number(story_id)
        next_version_id = version_id_from_number(next_number)
        if self.registry.version_exists(story_id, next_version_id):
            raise MangaMakerError("VERSION_ALREADY_EXISTS", f"Version {next_version_id} already exists.")

        current_files = {row["file_type"]: row for row in self.registry.get_files_for_version(story_id, current_version)}
        required = {"master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script"}
        missing = sorted(required - set(current_files))
        if missing:
            raise MangaMakerError("VERSION_SOURCE_INCOMPLETE", "Current version is missing required files.", details={"missing": missing})

        next_files = {ft: copy.deepcopy(rec["json_copy"]) for ft, rec in current_files.items() if ft != "version_manifest"}
        for ft, data in next_files.items():
            data["version_id"] = next_version_id

        applied_patch_ids: list[str] = []
        patch_results: list[dict[str, Any]] = []
        for patch in patches:
            target_file = patch["target_file"].replace(".json", "")
            if target_file not in next_files:
                raise MangaMakerError("PATCH_TARGET_FILE_MISSING", f"Patch target file missing: {target_file}")
            result = self._apply_patch(next_files[target_file], patch)
            applied_patch_ids.append(patch["patch_id"])
            patch_results.append({"patch_id": patch["patch_id"], "target_file": target_file, "target_branch": patch["target_branch"], **result})

        # Update workspace output links so the working file knows the new candidate.
        workspace = next_files.get("plot_workspace")
        if workspace:
            workspace.setdefault("workspace_status", {})["next_version_id_after_approval"] = next_version_id
            workspace.setdefault("output_links", {})["created_version_bundle"] = next_version_id
        script = next_files.get("chapter_script")
        if script:
            script.setdefault("memory_update_plan_after_chapter", {})["next_version_id"] = next_version_id
            # Carry-forward snapshot of the prior chapter is now fully integrated → "completed".
            # User regenerating for the next chapter will reset this back to "generated".
            metadata = script.setdefault("chapter_metadata", {})
            if metadata.get("chapter_status") in {"approved", "events_extracted"}:
                metadata["chapter_status"] = "completed"

        # Validate all copied/modified files before writing. Relationship-map validation allows enabled when 2+ profiles exist.
        for ft in ["master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script"]:
            self.validator.validate_story_file(file_type=ft, data=next_files[ft], story_id=story_id, version_id=next_version_id)

        now = datetime.now(timezone.utc).isoformat()
        base = self.snapshot_service.storage_root / story_id
        version_dir = base / "versions" / next_version_id
        records: list[dict[str, Any]] = []
        paths: dict[str, str] = {}

        official_names = self.snapshot_service.official_files
        working_names = self.snapshot_service.working_files
        for ft, filename in official_names.items():
            path = version_dir / filename
            checksum = self._write_json(path, next_files[ft])
            paths[ft] = str(path)
            records.append(self._record(story_id, next_version_id, ft, filename, str(path), next_files[ft], checksum))

        # Copy working files too, because the dev registry's current file endpoints expect them for the current version.
        for ft, filename in working_names.items():
            path = (base / "workspace" / filename) if ft == "plot_workspace" else (base / "scripts" / filename)
            checksum = self._write_json(path, next_files[ft])
            paths[ft] = str(path)
            records.append(self._record(story_id, next_version_id, ft, filename, str(path), next_files[ft], checksum))

        manifest = VersionManifest(
            story_id=story_id,
            version_id=next_version_id,
            previous_version_id=current_version,
            state_type="template_state",
            files=official_names,
            working_files=working_names,
            created_from_events=[e["event_id"] for e in events],
            created_at=now,
        ).model_dump()
        manifest_path = version_dir / "version_manifest.json"
        checksum = self._write_json(manifest_path, manifest)
        paths["version_manifest"] = str(manifest_path)
        records.append(self._record(story_id, next_version_id, "version_manifest", "version_manifest.json", str(manifest_path), manifest, checksum))

        self.registry.create_version_with_previous(
            story_id=story_id,
            version_id=next_version_id,
            version_number=next_number,
            previous_version_id=current_version,
            status="candidate",
            state_type="template_state",
            snapshot_folder_path=str(version_dir),
            created_from_event_ids=[e["event_id"] for e in events],
            now=now,
        )
        self.registry.create_file_records(records, now=now)
        self.registry.update_patches_applied(patch_ids=applied_patch_ids, applied_version_id=next_version_id)
        self.registry.update_events_version_to(event_ids=[e["event_id"] for e in events], version_to=next_version_id)

        return {
            "story_id": story_id,
            "version_from": current_version,
            "version_id": next_version_id,
            "status": "candidate",
            "snapshot_folder_path": str(version_dir),
            "created_from_events": [e["event_id"] for e in events],
            "applied_patches": applied_patch_ids,
            "patch_results": patch_results,
            "files": {**official_names, **working_names, "version_manifest": "version_manifest.json"},
            "paths": paths,
            "previous_version_frozen": True,
            "next_step": "mark_version_official",
        }

    def create_simple_snapshot(self, story_id: str) -> dict[str, Any]:
        """Create a version snapshot from the current files WITHOUT requiring story_events or json_patches.

        Used by the chapter-script approve flow so that approving a chapter script
        creates a version bundle that freezes all six current files (including the
        just-approved chapter_script.json).  The Writing Desk event+s+patch pipeline
        is a separate mechanism for arc-level planning; per-chapter snapshots do not
        need events.
        """
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)

        current_version = story["current_version_id"]
        next_number = self.registry.next_version_number(story_id)
        next_version_id = version_id_from_number(next_number)
        if self.registry.version_exists(story_id, next_version_id):
            raise MangaMakerError("VERSION_ALREADY_EXISTS", f"Version {next_version_id} already exists.")

        current_files = {row["file_type"]: row for row in self.registry.get_files_for_version(story_id, current_version)}
        required = {"master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script"}
        missing = sorted(required - set(current_files))
        if missing:
            raise MangaMakerError("VERSION_SOURCE_INCOMPLETE", "Current version is missing required files.", details={"missing": missing})

        next_files = {ft: copy.deepcopy(rec["json_copy"]) for ft, rec in current_files.items() if ft != "version_manifest"}
        for ft, data in next_files.items():
            data["version_id"] = next_version_id

        script = next_files.get("chapter_script")
        if script:
            script.setdefault("memory_update_plan_after_chapter", {})["next_version_id"] = next_version_id
            metadata = script.setdefault("chapter_metadata", {})
            if metadata.get("chapter_status") in {"approved", "events_extracted"}:
                metadata["chapter_status"] = "completed"

        for ft in ["master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script"]:
            self.validator.validate_story_file(file_type=ft, data=next_files[ft], story_id=story_id, version_id=next_version_id)

        now = datetime.now(timezone.utc).isoformat()
        base = self.snapshot_service.storage_root / story_id
        version_dir = base / "versions" / next_version_id
        records: list[dict[str, Any]] = []
        paths: dict[str, str] = {}

        official_names = self.snapshot_service.official_files
        working_names = self.snapshot_service.working_files
        for ft, filename in official_names.items():
            path = version_dir / filename
            checksum = self._write_json(path, next_files[ft])
            paths[ft] = str(path)
            records.append(self._record(story_id, next_version_id, ft, filename, str(path), next_files[ft], checksum))

        for ft, filename in working_names.items():
            path = (base / "workspace" / filename) if ft == "plot_workspace" else (base / "scripts" / filename)
            checksum = self._write_json(path, next_files[ft])
            paths[ft] = str(path)
            records.append(self._record(story_id, next_version_id, ft, filename, str(path), next_files[ft], checksum))

        manifest = VersionManifest(
            story_id=story_id,
            version_id=next_version_id,
            previous_version_id=current_version,
            state_type="template_state",
            files=official_names,
            working_files=working_names,
            created_from_events=[],
            created_at=now,
        ).model_dump()
        manifest_path = version_dir / "version_manifest.json"
        checksum = self._write_json(manifest_path, manifest)
        paths["version_manifest"] = str(manifest_path)
        records.append(self._record(story_id, next_version_id, "version_manifest", "version_manifest.json", str(manifest_path), manifest, checksum))

        self.registry.create_version_with_previous(
            story_id=story_id,
            version_id=next_version_id,
            version_number=next_number,
            previous_version_id=current_version,
            status="candidate",
            state_type="template_state",
            snapshot_folder_path=str(version_dir),
            created_from_event_ids=[],
            now=now,
        )
        self.registry.create_file_records(records, now=now)

        return {
            "story_id": story_id,
            "version_from": current_version,
            "version_id": next_version_id,
            "status": "candidate",
            "snapshot_folder_path": str(version_dir),
            "created_from_events": [],
            "applied_patches": [],
            "patch_results": [],
            "files": {**official_names, **working_names, "version_manifest": "version_manifest.json"},
            "paths": paths,
            "previous_version_frozen": True,
            "next_step": "mark_version_official",
        }

    def mark_official(self, story_id: str, version_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        version = self.registry.get_version(story_id, version_id)
        if not version:
            raise MangaMakerError("VERSION_NOT_FOUND", f"Version {version_id} not found", status_code=404)
        files = self.registry.get_files_for_version(story_id, version_id)
        required = {"master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script", "version_manifest"}
        present = {row["file_type"] for row in files}
        missing = sorted(required - present)
        if missing:
            raise MangaMakerError("VERSION_INCOMPLETE", "Cannot mark version official; files are missing.", details={"missing": missing})
        now = datetime.now(timezone.utc).isoformat()
        self.registry.mark_version_official(story_id=story_id, version_id=version_id, now=now)
        
        graph_sync = None
        vector_sync = None
        continuity_sync = None
        
        if self.graph_service:
            try:
                graph_sync = self.graph_service.project_events(story_id)
            except Exception as e:
                graph_sync = {"error": str(e)}
                
        if self.vector_service:
            try:
                vector_sync = self.vector_service.upsert_current_memory(story_id)
            except Exception as e:
                vector_sync = {"error": str(e)}
                
        if self.continuity_service:
            try:
                continuity_sync = self.continuity_service.check_version(story_id, version_id, "official_version")
            except Exception as e:
                continuity_sync = {"error": str(e)}

        return {
            "story_id": story_id, 
            "version_id": version_id, 
            "status": "official", 
            "story_current_version_id": version_id,
            "graph_sync": graph_sync,
            "vector_sync": vector_sync,
            "continuity_sync": continuity_sync
        }

    def _record(self, story_id: str, version_id: str, ft: str, filename: str, path: str, data: dict[str, Any], checksum: str) -> dict[str, Any]:
        return {
            "file_id": file_id(story_id, version_id, ft),
            "story_id": story_id,
            "version_id": version_id,
            "file_type": ft,
            "official_filename": filename,
            "storage_path": path,
            "state_type": data.get("state_type", "template_state"),
            "checksum": checksum,
            "json_copy": data,
        }

    def _write_json(self, path: Path, data: dict[str, Any]) -> str:
        path.parent.mkdir(parents=True, exist_ok=True)
        text = json.dumps(data, ensure_ascii=False, indent=2)
        path.write_text(text + "\n", encoding="utf-8")
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _apply_patch(self, data: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        branch = patch["target_branch"]
        op = patch["operation"]
        new_value = patch.get("new_value")
        parent, key = self._resolve_parent(data, branch, create=(op in {"add", "merge_object", "append_to_array"}))
        old_value = None

        if isinstance(parent, list):
            if isinstance(key, int):
                if key >= len(parent):
                    if op == "add":
                        parent.append(new_value)
                    else:
                        raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"List index out of range for {branch}")
                else:
                    old_value = copy.deepcopy(parent[key])
                    if op == "replace":
                        parent[key] = new_value
                    elif op == "merge_object":
                        if not isinstance(parent[key], dict) or not isinstance(new_value, dict):
                            raise MangaMakerError("PATCH_TYPE_ERROR", f"merge_object requires objects at {branch}")
                        parent[key].update(new_value)
                    elif op == "remove":
                        parent.pop(key)
                    elif op == "add":
                        parent.insert(key, new_value)
                    else:
                        raise MangaMakerError("UNSUPPORTED_PATCH_OPERATION", f"Unsupported op {op} for list target")
            else:
                raise MangaMakerError("PATCH_TYPE_ERROR", f"List parent requires numeric key for {branch}")
        else:
            old_value = copy.deepcopy(parent.get(key))
            if op == "replace":
                if key not in parent:
                    raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Path not found for replace: {branch}")
                parent[key] = new_value
            elif op == "add":
                parent[key] = new_value
            elif op == "remove":
                parent.pop(key, None)
            elif op == "merge_object":
                if key not in parent or parent[key] is None:
                    parent[key] = {}
                if not isinstance(parent[key], dict) or not isinstance(new_value, dict):
                    raise MangaMakerError("PATCH_TYPE_ERROR", f"merge_object requires objects at {branch}")
                parent[key].update(new_value)
            elif op == "append_to_array":
                if key not in parent or parent[key] is None:
                    parent[key] = []
                if not isinstance(parent[key], list):
                    raise MangaMakerError("PATCH_TYPE_ERROR", f"append_to_array requires array at {branch}")
                parent[key].append(new_value)
            else:
                raise MangaMakerError("UNSUPPORTED_PATCH_OPERATION", f"Unsupported patch operation: {op}")
        return {"old_value": old_value, "new_value": new_value, "operation": op, "applied": True}

    def _resolve_parent(self, root: dict[str, Any], branch: str, *, create: bool) -> tuple[Any, str | int]:
        tokens = self._parse_branch(branch)
        if not tokens:
            raise MangaMakerError("PATCH_PATH_ERROR", "Empty patch branch")
        current: Any = root
        for i, token in enumerate(tokens[:-1]):
            nxt = tokens[i + 1]
            if isinstance(token, str):
                if not isinstance(current, dict):
                    raise MangaMakerError("PATCH_PATH_ERROR", f"Expected object before {token} in {branch}")
                if token not in current or current[token] is None:
                    if not create:
                        raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Path not found: {branch}")
                    current[token] = [] if isinstance(nxt, (int, tuple)) else {}
                current = current[token]
            elif isinstance(token, int):
                if not isinstance(current, list):
                    raise MangaMakerError("PATCH_PATH_ERROR", f"Expected list before index {token} in {branch}")
                if token >= len(current):
                    raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Index out of range in {branch}")
                current = current[token]
            elif isinstance(token, tuple):
                current = self._lookup_in_list(current, token, branch=branch, create=create)

        last = tokens[-1]
        # If the terminal token is a list lookup, resolve to (list, index) so _apply_patch
        # can replace/merge/remove the matched item by index.
        if isinstance(last, tuple):
            if not isinstance(current, list):
                raise MangaMakerError("PATCH_PATH_ERROR", f"Expected list for terminal lookup in {branch}")
            match = self._lookup_in_list(current, last, branch=branch, create=create)
            try:
                idx = current.index(match)
            except ValueError:
                raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"Terminal lookup not located in {branch}")
            return current, idx
        return current, last

    def _lookup_in_list(self, current: Any, token: tuple, *, branch: str, create: bool) -> Any:
        lookup = token[1]
        if not isinstance(current, list):
            raise MangaMakerError("PATCH_PATH_ERROR", f"Expected list for lookup {lookup} in {branch}")
        lookup_field: str | None = None
        lookup_value = lookup
        if "=" in lookup:
            lookup_field, lookup_value = lookup.split("=", 1)
        for item in current:
            if not isinstance(item, dict):
                continue
            if lookup_field and str(item.get(lookup_field, "")) == lookup_value:
                return item
            if not lookup_field and (
                item.get("profile_id") == lookup_value
                or item.get("relationship_id") == lookup_value
                or item.get("character_name") == lookup_value
            ):
                return item
        if not create:
            raise MangaMakerError("PATCH_PATH_NOT_FOUND", f"No list item matching {lookup} in {branch}")
        if lookup_field == "character_name":
            safe_name = lookup_value.strip() or "Unknown"
            match = {
                "profile_id": f"unresolved_{safe_name.lower().replace(' ', '_')}",
                "profile_label": "Unresolved Character Mention",
                "character_name": safe_name,
                "status": {"selected": "unknown", "options": ["alive", "dead", "missing", "unknown", "custom"]},
            }
        else:
            match = {"id": lookup_value}
        current.append(match)
        return match

    def _parse_branch(self, branch: str) -> list[str | int | tuple[str, str]]:
        tokens: list[str | int | tuple[str, str]] = []
        for part in branch.split("."):
            while "[" in part:
                before, rest = part.split("[", 1)
                if before:
                    tokens.append(before)
                inside, part = rest.split("]", 1)
                if inside.isdigit():
                    tokens.append(int(inside))
                else:
                    tokens.append(("lookup", inside))
                if part.startswith("."):
                    part = part[1:]
            if part:
                tokens.append(part)
        return tokens
