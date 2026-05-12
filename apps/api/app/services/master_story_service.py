from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService


class MasterStoryService:
    """Template-phase editor for master_story.json.

    This service is intentionally limited to template_state editing. Once the
    story is promoted to story_state, master_story changes must go through the
    event/patch/version flow.
    """

    allowed_branches = {
        "title",
        "idea_so_far",
        "story_type.selected",
        "ending_direction.selected",
        "story_foundation.selected",
        "world_type.selected",
        "world_type.custom_world_type",
        "world_master_rules.selected",
        "world_master_rules.custom_rules",
        "world_master_rules.rule_details.magic_rules",
        "world_master_rules.rule_details.power_rules",
        "world_master_rules.rule_details.demon_rules",
        "world_master_rules.rule_details.monster_rules",
        "world_master_rules.rule_details.god_rules",
        "world_master_rules.rule_details.technology_rules",
        "world_master_rules.rule_details.race_species_rules",
        "world_master_rules.rule_details.realm_dimension_rules",
        "world_master_rules.rule_details.forbidden_rules",
        "world_master_rules.rule_details.power_limits",
        "world_master_rules.rule_details.custom_rule_details",
        "major_factions_and_ruling_sides.selected",
        "major_factions_and_ruling_sides.custom_factions",
        "major_factions_and_ruling_sides.faction_details.main_ruling_side",
        "major_factions_and_ruling_sides.faction_details.opposing_side",
        "major_factions_and_ruling_sides.faction_details.neutral_side",
        "major_factions_and_ruling_sides.faction_details.hidden_side",
        "major_factions_and_ruling_sides.faction_details.faction_list",
        "major_factions_and_ruling_sides.faction_details.ruling_side_details",
        "major_factions_and_ruling_sides.faction_details.conflict_map",
        "major_factions_and_ruling_sides.faction_details.custom_faction_details",
        "major_threats_and_minor_side_threats.major_threat",
        "major_threats_and_minor_side_threats.minor_side_threats",
        "major_threats_and_minor_side_threats.custom_threats",
        "major_threats_and_minor_side_threats.threat_details.main_threat_source",
        "major_threats_and_minor_side_threats.threat_details.main_threat_goal",
        "major_threats_and_minor_side_threats.threat_details.main_threat_target",
        "major_threats_and_minor_side_threats.threat_details.stakes_if_major_threat_wins",
        "major_threats_and_minor_side_threats.threat_details.minor_threat_sources",
        "major_threats_and_minor_side_threats.threat_details.minor_threat_goals",
        "major_threats_and_minor_side_threats.threat_details.stakes_if_minor_threats_win",
        "major_threats_and_minor_side_threats.threat_details.threat_level",
        "major_threats_and_minor_side_threats.threat_details.time_limit",
        "major_threats_and_minor_side_threats.threat_details.hidden_truth_behind_threat",
        "major_threats_and_minor_side_threats.threat_details.custom_threat_details",
        "faction_visual_signatures.signatures",
    }

    _allowed_faction_detail_fields = {
        "main_ruling_side",
        "opposing_side",
        "neutral_side",
        "hidden_side",
        "ruling_side_details",
        "conflict_map",
    }

    def _branch_allowed(self, target_branch: str) -> bool:
        if target_branch in self.allowed_branches:
            return True
        import re
        m = re.match(
            r"^major_factions_and_ruling_sides\.faction_details\.([a-z][a-z0-9_]{0,60})\.("
            + "|".join(re.escape(f) for f in self._allowed_faction_detail_fields)
            + r")$",
            target_branch,
        )
        return m is not None

    list_branches = {
        "story_type.selected",
        "world_master_rules.selected",
        "major_factions_and_ruling_sides.selected",
        "major_factions_and_ruling_sides.faction_details.faction_list",
        "major_threats_and_minor_side_threats.minor_side_threats",
        "major_threats_and_minor_side_threats.threat_details.minor_threat_sources",
        "major_threats_and_minor_side_threats.threat_details.minor_threat_goals",
    }

    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService, validator: ValidationService):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator

    def get_master_story(self, story_id: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, "master_story")
        if not record:
            raise MangaMakerError("MASTER_STORY_NOT_FOUND", f"master_story.json not found for {story_id}", status_code=404)
        data = record["json_copy"]
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "master_story",
            "state_type": data.get("state_type", "template_state"),
            "content": data,
        }

    def validate_master_story(self, story_id: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, "master_story")
        if not record:
            raise MangaMakerError("MASTER_STORY_NOT_FOUND", f"master_story.json not found for {story_id}", status_code=404)
        data = record["json_copy"]
        self.validator.validate_story_file(file_type="master_story", data=data, story_id=story_id, version_id=record["version_id"])
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "master_story",
            "validation_status": "passed",
            "checks": [
                "story_id matches registry",
                "version_id matches current version",
                "file_type is master_story",
                "state_type is template_state",
                "required master branches exist",
                "multi-select branches are arrays",
            ],
        }

    def patch_template(self, *, story_id: str, target_branch: str, operation: str, value: Any = None) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, "master_story")
        if not record:
            raise MangaMakerError("MASTER_STORY_NOT_FOUND", f"master_story.json not found for {story_id}", status_code=404)

        data = deepcopy(record["json_copy"])
        if data.get("state_type") != "template_state":
            raise MangaMakerError(
                "EVENT_REQUIRED",
                "master_story.json is no longer template_state. Use the event/patch/version flow for official changes.",
            )
        if not self._branch_allowed(target_branch):
            raise MangaMakerError(
                "BRANCH_NOT_ALLOWED",
                f"{target_branch} cannot be edited through /master-story/template",
                details={"allowed_branches": sorted(self.allowed_branches)},
            )

        self._validate_value_for_branch(data, target_branch, operation, value)
        updated_value = self._apply_patch(data, target_branch, operation, value)
        self.validator.validate_story_file(file_type="master_story", data=data, story_id=story_id, version_id=record["version_id"])
        checksum = self.snapshot_service.write_existing_json(path=record["storage_path"], data=data)
        now = datetime.now(timezone.utc).isoformat()
        self.registry.update_file_json_copy(
            story_id=story_id,
            version_id=record["version_id"],
            file_type="master_story",
            json_copy=data,
            checksum=checksum,
            now=now,
        )
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "master_story",
            "state_type": data["state_type"],
            "target_branch": target_branch,
            "operation": operation,
            "updated_value": updated_value,
            "validation_status": "passed",
        }

    def _validate_value_for_branch(self, data: dict[str, Any], target_branch: str, operation: str, value: Any) -> None:
        if operation in {"replace", "merge_object", "append_to_array"} and value is None:
            raise MangaMakerError("VALIDATION_ERROR", f"operation {operation} requires value")
        if target_branch in self.list_branches and operation == "replace" and not isinstance(value, list):
            raise MangaMakerError("VALIDATION_ERROR", f"{target_branch} must be a list")
        if operation == "append_to_array" and target_branch not in self.list_branches:
            raise MangaMakerError("VALIDATION_ERROR", f"append_to_array is only allowed for list branches")
        if operation == "merge_object":
            current = self._get_path(data, target_branch)
            if not isinstance(current, dict) or not isinstance(value, dict):
                raise MangaMakerError("VALIDATION_ERROR", "merge_object requires object branch and object value")
        # Option validation for selected fields with fixed options.
        option_parent = target_branch.rsplit(".selected", 1)[0] if target_branch.endswith(".selected") else None
        if option_parent:
            parent = self._get_path(data, option_parent)
            options = parent.get("options", []) if isinstance(parent, dict) else []
            values = value if isinstance(value, list) else [value]
            for item in values:
                if item and item not in options and item != "Custom":
                    raise MangaMakerError(
                        "INVALID_OPTION",
                        f"{item!r} is not a valid option for {target_branch}",
                        details={"options": options},
                    )

    def _apply_patch(self, data: dict[str, Any], target_branch: str, operation: str, value: Any) -> Any:
        parts = target_branch.split(".")
        parent = data
        for i, part in enumerate(parts[:-1]):
            if part not in parent:
                parent[part] = {}
            elif not isinstance(parent[part], dict):
                raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {target_branch}")
            parent = parent[part]
        key = parts[-1]
        if operation == "replace":
            parent[key] = value
        elif operation == "remove":
            if key not in parent:
                raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {target_branch}")
            current = parent[key]
            parent[key] = [] if isinstance(current, list) else "" if isinstance(current, str) else None
        elif operation == "append_to_array":
            if key not in parent or not isinstance(parent[key], list):
                raise MangaMakerError("BRANCH_NOT_ARRAY", f"Branch is not an array: {target_branch}")
            if isinstance(value, list):
                for item in value:
                    if item not in parent[key]:
                        parent[key].append(item)
            else:
                if value not in parent[key]:
                    parent[key].append(value)
        elif operation == "merge_object":
            if key not in parent or not isinstance(parent[key], dict):
                raise MangaMakerError("BRANCH_NOT_OBJECT", f"Branch is not an object: {target_branch}")
            parent[key].update(value)
        else:
            raise MangaMakerError("UNSUPPORTED_OPERATION", f"Unsupported operation: {operation}")
        return parent.get(key)

    def _get_path(self, data: dict[str, Any], branch: str) -> Any:
        current: Any = data
        for part in branch.split("."):
            if not isinstance(current, dict) or part not in current:
                raise MangaMakerError("BRANCH_NOT_FOUND", f"Branch not found: {branch}")
            current = current[part]
        return current
