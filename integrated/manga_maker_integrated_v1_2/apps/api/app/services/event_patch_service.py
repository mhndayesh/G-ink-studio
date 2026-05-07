from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService


class EventPatchService:
    """Foundation event + patch engine.

    v0.6 does not create vNext yet and does not mutate official JSON snapshots.
    It converts an approved plot_workspace.json confirmation into persisted official
    story_events and JSON patch proposals. VersionService applies these later.
    """

    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService, validator: ValidationService):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator

    def get_events(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        events = self.registry.get_story_events(story_id)
        return {"story_id": story_id, "current_version_id": story["current_version_id"], "events": events, "count": len(events)}

    def get_patches(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        patches = self.registry.get_json_patches(story_id)
        return {"story_id": story_id, "current_version_id": story["current_version_id"], "patches": patches, "count": len(patches)}

    def create_from_approved_workspace(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        workspace_record = self._current_file(story_id, "plot_workspace")
        workspace = deepcopy(workspace_record["json_copy"])
        workspace_id = workspace.get("workspace_id", "workspace_001")

        final = workspace.get("final_confirmation", {})
        if final.get("status") != "approved" or final.get("selected") != "Approve All":
            raise MangaMakerError(
                "WORKSPACE_NOT_APPROVED",
                "Approve plot workspace changes before creating official events and patches.",
                details={"final_confirmation_status": final.get("status"), "selected": final.get("selected")},
            )

        existing_events = self.registry.get_story_events(story_id, workspace_id=workspace_id)
        existing_patches = self.registry.get_json_patches(story_id, workspace_id=workspace_id)
        if existing_events or existing_patches:
            return {
                "story_id": story_id,
                "version_from": story["current_version_id"],
                "workspace_id": workspace_id,
                "created_events": [e["event_id"] for e in existing_events],
                "created_patches": [p["patch_id"] for p in existing_patches],
                "events": existing_events,
                "patches": existing_patches,
                "already_created": True,
                "next_step": "version_service_create_candidate",
                "validation_status": "passed",
            }

        proposed_events = workspace.get("proposed_official_events", [])
        if not proposed_events:
            raise MangaMakerError("NO_PROPOSED_EVENTS", "Workspace has no proposed_official_events. Run confirmation first.")

        characters = self._current_file(story_id, "characters")["json_copy"]
        name_to_profile = self._character_name_map(characters)

        now = datetime.now(timezone.utc).isoformat()
        official_events: list[dict[str, Any]] = []
        official_patches: list[dict[str, Any]] = []

        for index, proposed in enumerate(proposed_events, start=1):
            event_type = proposed.get("event_type") or "PLOT_INPUT_REVIEWED"
            category = self._event_category(event_type)
            target_file = self._target_file(event_type, proposed.get("target_file", "plot_outline"))
            target_name = proposed.get("payload", {}).get("target_entity_name") or proposed.get("target_entity_name", "")
            target_entity_id = proposed.get("target_entity_id") or self._resolve_character_id(target_name, name_to_profile)
            event_id = f"evt_{story_id}_{workspace_id}_{index:03d}"

            official_event = {
                "event_id": event_id,
                "story_id": story_id,
                "workspace_id": workspace_id,
                "version_from": story["current_version_id"],
                "version_to": None,
                "event_type": event_type,
                "event_category": category,
                "target_file": target_file,
                "target_entity_id": target_entity_id,
                "summary": proposed.get("summary", event_type),
                "payload": {
                    **proposed.get("payload", {}),
                    "foundation_note": "Created by EventPatchService v0.1 from approved plot_workspace.json confirmation.",
                },
                "created_from_detected_event_id": proposed.get("created_from_detected_event_id"),
                "created_from_question_id": proposed.get("created_from_question_id"),
                "approval_status": "approved",
                "created_at": now,
            }
            official_events.append(official_event)
            official_patches.extend(self._patches_for_event(
                story_id=story_id,
                workspace_id=workspace_id,
                event=official_event,
                patch_index_start=len(official_patches) + 1,
                characters=characters,
                name_to_profile=name_to_profile,
                now=now,
            ))

        self.registry.create_story_events(official_events)
        self.registry.create_json_patches(official_patches)

        self._write_workspace_official_ids(workspace_record=workspace_record, workspace=workspace, events=official_events, patches=official_patches)

        return {
            "story_id": story_id,
            "version_from": story["current_version_id"],
            "workspace_id": workspace_id,
            "created_events": [e["event_id"] for e in official_events],
            "created_patches": [p["patch_id"] for p in official_patches],
            "events": official_events,
            "patches": official_patches,
            "already_created": False,
            "next_step": "version_service_create_candidate",
            "validation_status": "passed",
        }

    def _current_file(self, story_id: str, file_type: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, file_type)
        if not record:
            raise MangaMakerError("FILE_NOT_FOUND", f"{file_type} not found for story {story_id}", status_code=404)
        return record

    def _character_name_map(self, characters: dict[str, Any]) -> dict[str, dict[str, Any]]:
        result = {}
        for profile in characters.get("created_major_character_profiles", []):
            name = profile.get("character_name", "")
            if name:
                result[name.lower()] = profile
        return result

    def _resolve_character_id(self, target_name: str, name_to_profile: dict[str, dict[str, Any]]) -> str:
        if not target_name:
            return ""
        # target_name can be "Kai / Ren". Pick the first known name.
        for part in [p.strip() for p in target_name.split("/")]:
            profile = name_to_profile.get(part.lower())
            if profile:
                return profile.get("profile_id", "")
        profile = name_to_profile.get(target_name.lower())
        return profile.get("profile_id", "") if profile else ""

    def _event_category(self, event_type: str) -> str:
        if event_type in {"CHARACTER_INJURED", "CHARACTER_HEALED", "CHARACTER_DIED", "CHARACTER_ALLEGIANCE_CHANGED", "CHARACTER_ALLEGIANCE_CHANGED_OR_REVEALED", "CHARACTER_REPUTATION_CHANGED"}:
            return "character_events"
        if event_type in {"CHARACTER_ATTACKED_CHARACTER", "RELATIONSHIP_TRUST_CHANGED", "RELATIONSHIP_CHANGED", "RELATIONSHIP_BETRAYAL"}:
            return "relationship_events"
        if event_type in {"CHARACTER_POWER_LOST", "CHARACTER_POWER_AWAKENED", "CHARACTER_POWER_EVOLVED"}:
            return "power_events"
        if event_type in {"WORLD_RULE_CHANGED", "LOCATION_DESTROYED", "STORY_FOUNDATION_SHIFTED"}:
            return "world_events"
        if event_type in {"THREAT_REVEALED", "THREAT_LEVEL_CHANGED"}:
            return "threat_events"
        return "plot_events"

    def _target_file(self, event_type: str, proposed_target: str) -> str:
        if event_type.startswith("CHARACTER_") or event_type.startswith("RELATIONSHIP_"):
            return "characters"
        if event_type.startswith("WORLD_") or event_type.startswith("LOCATION_") or event_type.startswith("FACTION_") or event_type.startswith("THREAT_"):
            return "master_story"
        target = proposed_target.replace(".json", "")
        if target in {"characters", "master_story", "plot_outline", "memory_system"}:
            return target
        return "plot_outline"

    def _patches_for_event(
        self,
        *,
        story_id: str,
        workspace_id: str,
        event: dict[str, Any],
        patch_index_start: int,
        characters: dict[str, Any],
        name_to_profile: dict[str, dict[str, Any]],
        now: str,
    ) -> list[dict[str, Any]]:
        event_type = event["event_type"]
        payload = event.get("payload", {})
        target_name = payload.get("target_entity_name", "")
        target_id = event.get("target_entity_id", "")
        decision = payload.get("user_decision", "")
        custom = payload.get("custom_answer", "")
        patches: list[dict[str, Any]] = []

        def make_patch(target_file: str, target_branch: str, operation: str, new_value: Any, reason: str, old_value: Any = None) -> None:
            patch_id = f"patch_{story_id}_{workspace_id}_{patch_index_start + len(patches):03d}"
            patches.append({
                "patch_id": patch_id,
                "story_id": story_id,
                "workspace_id": workspace_id,
                "event_id": event["event_id"],
                "target_file": target_file,
                "target_branch": target_branch,
                "operation": operation,
                "old_value": old_value,
                "new_value": new_value,
                "reason": reason,
                "approval_status": "approved",
                "applied_version_id": None,
                "created_at": now,
            })

        if event_type == "CHARACTER_INJURED":
            branch_base = self._character_branch(target_id=target_id, target_name=target_name, name_to_profile=name_to_profile)
            make_patch(
                "characters",
                f"{branch_base}.status",
                "merge_object",
                {"selected": "injured", "injury_consequence": decision, "custom_injury_consequence": custom},
                "Apply injury consequence to character status after version creation.",
            )
            if "Power" in decision or "power" in custom.lower():
                make_patch(
                    "characters",
                    f"{branch_base}.optional_powers_and_power_level.power_details",
                    "merge_object",
                    {"temporary_or_permanent_power_change": decision, "custom_power_change": custom},
                    "Track injury-related power consequence.",
                )
            return patches

        if event_type == "CHARACTER_ATTACKED_CHARACTER":
            make_patch(
                "characters",
                "character_relationship_map.relationships",
                "append_to_array",
                {
                    "relationship_event_source": event["event_id"],
                    "relationship_change_type": decision or "Review Required",
                    "characters_involved": target_name,
                    "reason": payload.get("evidence", event.get("summary", "")),
                    "custom_relationship_change": custom,
                },
                "Append relationship-map consequence from attack/fight event. VersionService may later merge this into an existing relationship edge.",
            )
            return patches

        if event_type in {"CHARACTER_ALLEGIANCE_CHANGED_OR_REVEALED", "CHARACTER_ALLEGIANCE_CHANGED"}:
            branch_base = self._character_branch(target_id=target_id, target_name=target_name, name_to_profile=name_to_profile)
            make_patch(
                "characters",
                f"{branch_base}.main_character_faction_alignment.alignment_details",
                "merge_object",
                {
                    "allegiance_reveal": decision,
                    "hidden_allegiance_note": custom,
                    "revealed_from_event_id": event["event_id"],
                },
                "Apply spy/betrayal/allegiance reveal to character faction alignment.",
            )
            make_patch(
                "characters",
                "character_relationship_map.relationships",
                "append_to_array",
                {
                    "relationship_event_source": event["event_id"],
                    "relationship_change_type": "Allegiance reveal affects trust",
                    "characters_involved": target_name,
                    "reason": decision,
                    "custom_relationship_change": custom,
                },
                "Spy or betrayal reveal can affect relationship map trust.",
            )
            return patches

        if event_type == "PLOT_INPUT_REVIEWED":
            make_patch(
                "plot_outline",
                "plot_threads.main_plot_thread.turning_points",
                "append_to_array",
                {"event_id": event["event_id"], "summary": event["summary"]},
                "Record reviewed free plot input as plot-thread memory.",
            )
            return patches

        # General fallback: keep it in plot outline thread memory until a specific mapping is added.
        make_patch(
            "plot_outline",
            "plot_threads.main_plot_thread.turning_points",
            "append_to_array",
            {"event_id": event["event_id"], "event_type": event_type, "summary": event["summary"], "payload": payload},
            "Fallback event-to-patch mapping for foundation build.",
        )
        return patches

    def _character_branch(self, *, target_id: str, target_name: str, name_to_profile: dict[str, dict[str, Any]]) -> str:
        if target_id:
            return f"created_major_character_profiles[{target_id}]"
        if target_name:
            for part in [p.strip() for p in target_name.split("/")]:
                if part.lower() in name_to_profile:
                    return f"created_major_character_profiles[{name_to_profile[part.lower()].get('profile_id')}]"
            return f"created_major_character_profiles[character_name={target_name}]"
        return "created_major_character_profiles[unknown]"

    def _write_workspace_official_ids(self, *, workspace_record: dict[str, Any], workspace: dict[str, Any], events: list[dict[str, Any]], patches: list[dict[str, Any]]) -> None:
        workspace["proposed_official_events"] = [
            {
                "event_id": e["event_id"],
                "event_type": e["event_type"],
                "target_file": e["target_file"],
                "target_entity_id": e.get("target_entity_id", ""),
                "summary": e["summary"],
                "payload": e.get("payload", {}),
                "created_from_detected_event_id": e.get("created_from_detected_event_id", ""),
                "created_from_question_id": e.get("created_from_question_id", ""),
                "approval_status": "approved",
            }
            for e in events
        ]
        grouped = {"master_story": [], "characters": [], "plot_outline": [], "relationship_map": []}
        for patch in patches:
            key = "relationship_map" if patch["target_branch"].startswith("character_relationship_map") else patch["target_file"]
            grouped.setdefault(key, []).append({
                "patch_id": patch["patch_id"],
                "target_file": f"{patch['target_file']}.json",
                "target_branch": patch["target_branch"],
                "operation": patch["operation"],
                "old_value": patch.get("old_value"),
                "new_value": patch.get("new_value"),
                "reason": patch.get("reason", ""),
                "approval_status": "approved",
            })
        workspace["proposed_json_patches"] = grouped
        workspace.setdefault("output_links", {})["created_events"] = [e["event_id"] for e in events]
        workspace.setdefault("workspace_status", {})["current_stage"] = "approved_events_and_patches_created"
        checksum = self.snapshot_service.write_existing_json(path=workspace_record["storage_path"], data=workspace)
        self.registry.update_file_json_copy(
            story_id=workspace_record["story_id"],
            version_id=workspace_record["version_id"],
            file_type="plot_workspace",
            json_copy=workspace,
            checksum=checksum,
            now=datetime.now(timezone.utc).isoformat(),
        )
