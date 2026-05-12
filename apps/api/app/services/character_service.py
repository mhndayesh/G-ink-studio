from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService


class CharacterService:
    """Template-phase editor for characters.json.

    This service handles only safe template_state character setup:
    - choosing the main character structure
    - generating the creation queue
    - creating full major character profiles from the template
    - enforcing relationship map lock/unlock rules

    Official story-state character changes later go through events/patches/versioning.
    """

    fixed_count_keys = {"required_major_profiles", "minimum_major_profiles"}

    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService, validator: ValidationService):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator

    def get_characters(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "characters",
            "state_type": data.get("state_type", "template_state"),
            "relationship_map_available": self._relationship_map_available(data),
            "relationship_map_enabled": data.get("character_relationship_map", {}).get("is_enabled", False),
            "created_major_character_profiles_count": len(data.get("created_major_character_profiles", [])),
            "created_side_character_profiles_count": len(data.get("created_side_character_profiles", [])),
            "content": data,
        }

    def validate_characters(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        self.validator.validate_story_file(file_type="characters", data=data, story_id=story_id, version_id=record["version_id"])
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "characters",
            "validation_status": "passed",
            "checks": [
                "story_id matches registry",
                "version_id matches current version",
                "file_type is characters",
                "state_type is template_state",
                "master_story_file is master_story.json",
                "relationship map lock rule passed",
                "relationship placeholders are not created before real profiles",
            ],
        }

    def update_structure(
        self,
        *,
        story_id: str,
        selected: str,
        custom_main_character_structure: str = "",
        requested_major_profiles: int | None = None,
    ) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)

        structure = data.get("main_character_structure", {})
        options = structure.get("options", [])
        if selected not in options:
            raise MangaMakerError("INVALID_OPTION", f"{selected!r} is not a valid main character structure", details={"options": options})

        rules = structure.get("branching_logic", {}).get("rules", {})
        rule = rules.get(selected, {})
        profile_count = self._resolve_profile_count(selected=selected, rule=rule, requested_major_profiles=requested_major_profiles)

        structure["selected"] = selected
        structure["custom_main_character_structure"] = custom_main_character_structure if selected == "Custom" else ""
        structure.setdefault("structure_details", {})["major_profile_count"] = profile_count
        structure["structure_details"]["main_character_count"] = profile_count

        data["main_character_structure"] = structure
        data["character_creation_queue"] = self._build_creation_queue(profile_count=profile_count)

        # Changing structure invalidates fake/old empty relationship setup, but keeps real created profiles only if they still fit.
        # In v0.1, keep existing created profiles but re-lock map if fewer than 2 exist.
        if len(data.get("created_major_character_profiles", [])) < 2:
            data["character_relationship_map"]["is_enabled"] = False
            data["character_relationship_map"]["relationships"] = []

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "selected": selected,
            "profiles_to_create": data["character_creation_queue"]["profiles_to_create"],
            "relationship_map_available": self._relationship_map_available(data),
            "relationship_map_enabled": data["character_relationship_map"].get("is_enabled", False),
            "validation_status": "passed",
        }

    def create_profile(
        self,
        *,
        story_id: str,
        profile_id: str,
        character_name: str,
        profile_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)
        profile_data = profile_data or {}

        queue_items = data.setdefault("character_creation_queue", {}).setdefault("profiles_to_create", [])
        if any(p.get("profile_id") == profile_id for p in data.get("created_major_character_profiles", [])):
            raise MangaMakerError("PROFILE_ALREADY_EXISTS", f"{profile_id} already exists")

        queue_item = next((item for item in queue_items if item.get("profile_id") == profile_id), None)
        if queue_item is None:
            queue_item = {
                "profile_id": profile_id,
                "profile_label": profile_id,
                "profile_type": "Major Character",
                "is_required": False,
                "uses_template": "character_profile_template",
                "status": "created",
            }
            queue_items.append(queue_item)

        template = deepcopy(data.get("character_profile_template", {}))
        if not template:
            raise MangaMakerError("TEMPLATE_MISSING", "characters.character_profile_template is missing")

        template["profile_id"] = profile_id
        template["profile_label"] = queue_item.get("profile_label", profile_id)
        template["character_name"] = character_name
        crl_raw = profile_data.pop("character_role_level", None)
        if crl_raw is not None:
            if isinstance(crl_raw, dict):
                template["character_role_level"]["selected"] = crl_raw.get("selected", "")
                template["character_role_level"]["custom_character_role_level"] = crl_raw.get("custom_character_role_level", "")
            elif isinstance(crl_raw, str):
                template["character_role_level"]["selected"] = crl_raw

        self._deep_merge(template, profile_data)
        data.setdefault("created_major_character_profiles", []).append(template)

        queue_item["status"] = "created"
        queue_item["character_name"] = character_name

        if len(data.get("created_major_character_profiles", [])) < 2:
            data["character_relationship_map"]["is_enabled"] = False
            data["character_relationship_map"]["relationships"] = []

        self._save(story_id=story_id, record=record, data=data)
        count = len(data.get("created_major_character_profiles", []))
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "profile_id": profile_id,
            "character_name": character_name,
            "created_major_character_profiles_count": count,
            "relationship_map_available": count >= 2,
            "relationship_map_enabled": data["character_relationship_map"].get("is_enabled", False),
            "validation_status": "passed",
        }

    def create_side_character_profile(
        self,
        *,
        story_id: str,
        character_name: str,
        profile_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)

        side_id = f"side_{len(data.get('created_side_character_profiles', [])) + 1:03d}"
        template = deepcopy(data.get("character_profile_template", {}))
        if not template:
            raise MangaMakerError("TEMPLATE_MISSING", "characters.character_profile_template is missing")

        template["profile_id"] = side_id
        template["profile_label"] = character_name
        template["character_name"] = character_name
        template["character_role_level"]["selected"] = "Supporting Character"
        profile_data = profile_data or {}
        self._deep_merge(template, profile_data)
        data.setdefault("created_side_character_profiles", []).append(template)

        self._save(story_id=story_id, record=record, data=data)
        count = len(data.get("created_side_character_profiles", []))
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "profile_id": side_id,
            "character_name": character_name,
            "created_side_character_profiles_count": count,
            "validation_status": "passed",
        }

    def update_profile(
        self,
        *,
        story_id: str,
        profile_id: str,
        character_name: str,
        profile_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)
        profile_data = profile_data or {}
        profiles = data.get("created_major_character_profiles", [])
        existing = next((p for p in profiles if p.get("profile_id") == profile_id), None)
        if existing is None:
            raise MangaMakerError("PROFILE_NOT_FOUND", f"Major profile {profile_id} not found", status_code=404)
        old_name = existing.get("character_name", "")
        existing["character_name"] = character_name
        if old_name and old_name != character_name:
            self._rename_in_relationship_map(data, old_name, character_name)
        crl_raw = profile_data.pop("character_role_level", None)
        if crl_raw is not None:
            if isinstance(crl_raw, dict):
                existing["character_role_level"]["selected"] = crl_raw.get("selected", existing["character_role_level"].get("selected", ""))
                existing["character_role_level"]["custom_character_role_level"] = crl_raw.get("custom_character_role_level", existing["character_role_level"].get("custom_character_role_level", ""))
            elif isinstance(crl_raw, str):
                existing["character_role_level"]["selected"] = crl_raw
        self._deep_merge(existing, profile_data)
        queue = data.get("character_creation_queue", {}).get("profiles_to_create", [])
        for item in queue:
            if item.get("profile_id") == profile_id:
                item["character_name"] = character_name
        self._save(story_id=story_id, record=record, data=data)
        count = len(data.get("created_major_character_profiles", []))
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "profile_id": profile_id,
            "character_name": character_name,
            "created_major_character_profiles_count": count,
            "relationship_map_available": count >= 2,
            "relationship_map_enabled": data["character_relationship_map"].get("is_enabled", False),
            "validation_status": "passed",
        }

    def update_side_character_profile(
        self,
        *,
        story_id: str,
        profile_id: str,
        character_name: str,
        profile_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)
        profile_data = profile_data or {}
        profiles = data.get("created_side_character_profiles", [])
        existing = next((p for p in profiles if p.get("profile_id") == profile_id), None)
        if existing is None:
            raise MangaMakerError("PROFILE_NOT_FOUND", f"Side profile {profile_id} not found", status_code=404)
        old_name = existing.get("character_name", "")
        existing["character_name"] = character_name
        existing["profile_label"] = character_name
        if old_name and old_name != character_name:
            self._rename_in_relationship_map(data, old_name, character_name)
        self._deep_merge(existing, profile_data)
        self._save(story_id=story_id, record=record, data=data)
        count = len(data.get("created_side_character_profiles", []))
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "profile_id": profile_id,
            "character_name": character_name,
            "created_side_character_profiles_count": count,
            "validation_status": "passed",
        }

    def _find_character_references(self, story_id: str, character_name: str) -> list[dict[str, str]]:
        """Scan plot_outline.json for references to character_name and return warning locations."""
        references: list[dict[str, str]] = []
        plot_record = self.registry.get_current_file(story_id, "plot_outline")
        if not plot_record:
            return references
        plot_data = plot_record["json_copy"]
        for ch in plot_data.get("chapter_or_episode_list", {}).get("chapters", []):
            ch_name = ch.get("chapter_title", "") or ch.get("chapter_id", "")
            chars = ch.get("characters_present", [])
            if isinstance(chars, list) and any(character_name in c for c in chars):
                references.append({"location": f"chapters/{ch.get('chapter_id', '')}", "detail": f"Chapter '{ch_name}' lists {character_name} in characters_present"})
        for sc in plot_data.get("scene_cards", {}).get("scenes", []):
            sc_id = sc.get("scene_id", "")
            sc_name = sc.get("location", "") or sc_id
            chars = sc.get("characters_present", [])
            if isinstance(chars, list) and any(character_name in c for c in chars):
                references.append({"location": f"scenes/{sc_id}", "detail": f"Scene '{sc_name}' lists {character_name} in characters_present"})
        threads = plot_data.get("plot_threads", {})
        for arc in threads.get("character_arc_threads", []):
            if character_name in arc.get("character_id", ""):
                references.append({"location": "threads/character_arcs", "detail": f"Character arc thread references {character_name}"})
        for rel in threads.get("relationship_threads", []):
            if character_name in rel.get("relationship_id", ""):
                references.append({"location": "threads/relationships", "detail": f"Relationship thread references {character_name}"})
        for pwr in threads.get("power_threads", []):
            if character_name in pwr.get("character_id", ""):
                references.append({"location": "threads/powers", "detail": f"Power thread references {character_name}"})
        return references

    def _remove_character_references_from_plot(self, story_id: str, character_name: str) -> list[dict[str, str]]:
        """Remove all references to character_name from plot_outline.json. Returns warnings."""
        warnings: list[dict[str, str]] = []
        plot_record = self.registry.get_current_file(story_id, "plot_outline")
        if not plot_record:
            return warnings
        from copy import deepcopy
        plot_data = deepcopy(plot_record["json_copy"])
        changed = False
        for ch in plot_data.get("chapter_or_episode_list", {}).get("chapters", []):
            chars = ch.get("characters_present", [])
            if isinstance(chars, list):
                filtered = [c for c in chars if c != character_name]
                if len(filtered) < len(chars):
                    warnings.append({"location": f"chapters/{ch.get('chapter_id', '')}", "detail": f"Removed {character_name} from chapter characters_present"})
                    changed = True
                ch["characters_present"] = filtered
        for sc in plot_data.get("scene_cards", {}).get("scenes", []):
            chars = sc.get("characters_present", [])
            if isinstance(chars, list):
                filtered = [c for c in chars if c != character_name]
                if len(filtered) < len(chars):
                    warnings.append({"location": f"scenes/{sc.get('scene_id', '')}", "detail": f"Removed {character_name} from scene characters_present"})
                    changed = True
                sc["characters_present"] = filtered
        threads = plot_data.get("plot_threads", {})
        char_arcs: list = threads.get("character_arc_threads", [])
        if isinstance(char_arcs, list):
            cleaned = [arc for arc in char_arcs if character_name not in arc.get("character_id", "")]
            if len(cleaned) < len(char_arcs):
                warnings.append({"location": "threads/character_arcs", "detail": f"Removed character arc thread referencing {character_name}"})
                threads["character_arc_threads"] = cleaned
                changed = True
        relationships: list = threads.get("relationship_threads", [])
        if isinstance(relationships, list):
            cleaned = [r for r in relationships if character_name not in r.get("relationship_id", "")]
            if len(cleaned) < len(relationships):
                warnings.append({"location": "threads/relationships", "detail": f"Removed relationship thread referencing {character_name}"})
                threads["relationship_threads"] = cleaned
                changed = True
        powers: list = threads.get("power_threads", [])
        if isinstance(powers, list):
            cleaned = [p for p in powers if character_name not in p.get("character_id", "")]
            if len(cleaned) < len(powers):
                warnings.append({"location": "threads/powers", "detail": f"Removed power thread referencing {character_name}"})
                threads["power_threads"] = cleaned
                changed = True
        if changed:
            checksum = self.snapshot_service.write_existing_json(path=plot_record["storage_path"], data=plot_data)
            now = datetime.now(timezone.utc).isoformat()
            self.registry.update_file_json_copy(
                story_id=story_id,
                version_id=plot_record["version_id"],
                file_type="plot_outline",
                json_copy=plot_data,
                checksum=checksum,
                now=now,
            )
        return warnings

    def delete_profile(self, *, story_id: str, profile_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)
        profiles = data.get("created_major_character_profiles", [])
        index = next((i for i, p in enumerate(profiles) if p.get("profile_id") == profile_id), None)
        if index is None:
            raise MangaMakerError("PROFILE_NOT_FOUND", f"Major profile {profile_id!r} not found", status_code=404)
        character_name = profiles[index].get("character_name", "")
        cross_ref_warnings = []
        if character_name:
            cross_ref_warnings = self._remove_character_references_from_plot(story_id, character_name)
        profiles.pop(index)
        rel_map = data.get("character_relationship_map", {})
        rels: list = rel_map.get("relationships", [])
        if isinstance(rels, list):
            cleaned_rels = [r for r in rels if (
                r.get("from") != profile_id
                and r.get("to") != profile_id
                and character_name not in (r.get("characters_involved") or "")
            )]
            if len(cleaned_rels) < len(rels):
                cross_ref_warnings.append({"location": "relationship_map", "detail": f"Removed {len(rels) - len(cleaned_rels)} relationship map entries referencing {character_name}"})
                rel_map["relationships"] = cleaned_rels
        if len(profiles) < 2:
            data["character_relationship_map"]["is_enabled"] = False
            data["character_relationship_map"]["relationships"] = []
        self._save(story_id=story_id, record=record, data=data)
        count = len(data.get("created_major_character_profiles", []))
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "profile_id": profile_id,
            "created_major_character_profiles_count": count,
            "relationship_map_available": count >= 2,
            "relationship_map_enabled": data["character_relationship_map"].get("is_enabled", False),
            "cross_reference_warnings": cross_ref_warnings,
            "validation_status": "passed",
        }

    def delete_side_profile(self, *, story_id: str, profile_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)
        profiles = data.get("created_side_character_profiles", [])
        index = next((i for i, p in enumerate(profiles) if p.get("profile_id") == profile_id), None)
        if index is None:
            raise MangaMakerError("PROFILE_NOT_FOUND", f"Side profile {profile_id!r} not found", status_code=404)
        character_name = profiles[index].get("character_name", "")
        cross_ref_warnings = []
        if character_name:
            cross_ref_warnings = self._remove_character_references_from_plot(story_id, character_name)
        profiles.pop(index)
        self._save(story_id=story_id, record=record, data=data)
        count = len(data.get("created_side_character_profiles", []))
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "profile_id": profile_id,
            "created_side_character_profiles_count": count,
            "cross_reference_warnings": cross_ref_warnings,
            "validation_status": "passed",
        }

    def check_character_conflicts(
        self,
        *,
        story_id: str,
        profile_id: str,
        new_name: str | None = None,
    ) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        plot_record = self.registry.get_current_file(story_id, "plot_outline")
        plot_data = plot_record["json_copy"] if plot_record else {}
        conflicts: list[dict[str, Any]] = []
        profile = None
        for p in data.get("created_major_character_profiles", []):
            if p.get("profile_id") == profile_id:
                profile = p
                break
        if profile is None:
            for p in data.get("created_side_character_profiles", []):
                if p.get("profile_id") == profile_id:
                    profile = p
                    break
        old_name = (profile.get("character_name") or "") if profile else ""
        target_name = new_name or old_name
        for p_list_name in ["created_major_character_profiles", "created_side_character_profiles"]:
            for p in data.get(p_list_name, []):
                pid = p.get("profile_id", "")
                if pid != profile_id and p.get("character_name") == target_name and target_name:
                    conflicts.append({
                        "severity": "warning",
                        "code": "DUPLICATE_NAME",
                        "message": f"Character name '{target_name}' is already used by {pid}",
                    })
        if plot_data and old_name and new_name and old_name != new_name:
            chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", [])
            for ch in chapters:
                if not isinstance(ch, dict):
                    continue
                chars = ch.get("characters_present", [])
                if isinstance(chars, list) and old_name in chars:
                    conflicts.append({
                        "severity": "warning",
                        "code": "PLOT_REFERENCE_FOUND",
                        "message": f"Character '{old_name}' is referenced in chapter '{ch.get('chapter_title', ch.get('chapter_id', 'unknown'))}' as characters_present",
                        "details": {"chapter_id": ch.get("chapter_id"), "chapter_title": ch.get("chapter_title")},
                    })
            scenes = plot_data.get("scene_cards", {}).get("scenes", [])
            for sc in scenes:
                if not isinstance(sc, dict):
                    continue
                chars = sc.get("characters_present", [])
                if isinstance(chars, list) and old_name in chars:
                    conflicts.append({
                        "severity": "warning",
                        "code": "PLOT_REFERENCE_FOUND",
                        "message": f"Character '{old_name}' is referenced in scene '{sc.get('scene_id', 'unknown')}'",
                        "details": {"scene_id": sc.get("scene_id"), "location": sc.get("location")},
                    })
        if profile:
            faction = (profile.get("main_character_faction_alignment") or {}).get("selected", "")
            if faction and faction not in ("Custom", "Independent / Free Character", "No Faction", "Outsider To All Factions"):
                faction_name = (profile.get("main_character_faction_alignment") or {}).get("alignment_details", {}).get("linked_master_faction", "")
                if faction_name:
                    master = self.registry.get_current_file(story_id, "master_story")
                    if master:
                        master_data = master["json_copy"]
                        factions = master_data.get("major_factions_and_ruling_sides", {}).get("selected", [])
                        if faction_name not in factions:
                            conflicts.append({
                                "severity": "warning",
                                "code": "FACTION_MISMATCH",
                                "message": f"Faction '{faction_name}' is not in master_story.json's major_factions_and_ruling_sides",
                            })
        return {
            "story_id": story_id,
            "profile_id": profile_id,
            "profile_name": target_name,
            "conflict_count": len(conflicts),
            "conflicts": conflicts,
            "has_conflicts": len(conflicts) > 0,
        }

    def activate_relationship_map(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)
        count = len(data.get("created_major_character_profiles", []))
        if count < 2:
            raise MangaMakerError(
                "RELATIONSHIP_MAP_LOCKED",
                "Create at least 2 real major profiles before enabling relationship map.",
                status_code=409,
                details={"created_major_character_profiles_count": count},
            )
        data["character_relationship_map"]["is_enabled"] = True
        data["character_relationship_map"].setdefault("relationships", [])
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "is_enabled": True,
            "relationships": data["character_relationship_map"].get("relationships", []),
            "validation_status": "passed",
        }

    def apply_relationship_updates(self, *, story_id: str, relationships: list[dict[str, Any]]) -> dict[str, Any]:
        import re as _re
        def _slug(s: str) -> str:
            return _re.sub(r"[^a-z0-9]+", "_", (s or "").lower()).strip("_")
        def _rel_id_from_pair(pair: str) -> str:
            parts = [p.strip() for p in (pair or "").split("/") if p.strip()]
            if len(parts) < 2:
                return ""
            return f"rel_{_slug(parts[0])}__{_slug(parts[1])}"

        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        self._ensure_template_state(data)
        count = len(data.get("created_major_character_profiles", []))
        if count < 2:
            raise MangaMakerError("RELATIONSHIP_MAP_LOCKED", "Create at least 2 real major profiles before updating relationships.", status_code=409)
        existing: list[dict] = data["character_relationship_map"].get("relationships", [])
        if not data["character_relationship_map"].get("is_enabled", False):
            data["character_relationship_map"]["is_enabled"] = True
        # Backfill stable relationship_id on any pre-existing entries that lack one.
        # This is a lazy migration so older stories pick up stable IDs the first time
        # any relationship update runs.
        for r in existing:
            if not r.get("relationship_id"):
                rid = _rel_id_from_pair(r.get("characters_involved", ""))
                if rid:
                    r["relationship_id"] = rid
        added = 0
        seen_pairs: set[str] = set()
        for r in existing:
            pair = r.get("characters_involved", "")
            if pair:
                seen_pairs.add(pair.strip().lower())
        for r in relationships:
            pair = (r.get("characters_involved", "") or "").strip()
            if not pair or "/" not in pair:
                continue
            if pair.lower() in seen_pairs:
                continue
            existing.append({
                "relationship_id": _rel_id_from_pair(pair),
                "characters_involved": pair,
                "relationship_change_type": r.get("relationship_change_type", "neutral"),
                "reason": r.get("reason", ""),
                "relationship_event_source": r.get("relationship_event_source", "manual"),
                "custom_relationship_change": r.get("custom_relationship_change", ""),
            })
            seen_pairs.add(pair.lower())
            added += 1
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "added": added,
            "total": len(existing),
            "validation_status": "passed",
        }

    def _get_record(self, story_id: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, "characters")
        if not record:
            raise MangaMakerError("CHARACTERS_NOT_FOUND", f"characters.json not found for {story_id}", status_code=404)
        return record

    def _ensure_template_state(self, data: dict[str, Any]) -> None:
        if data.get("state_type") != "template_state":
            raise MangaMakerError(
                "EVENT_REQUIRED",
                "characters.json is no longer template_state. Use the event/patch/version flow for official changes.",
            )

    def _resolve_profile_count(self, *, selected: str, rule: dict[str, Any], requested_major_profiles: int | None) -> int:
        mode = rule.get("profile_count_mode")
        if "required_major_profiles" in rule and mode in {"fixed", "fixed_or_expandable"} and requested_major_profiles is None:
            return int(rule["required_major_profiles"])
        minimum = int(rule.get("minimum_major_profiles", rule.get("required_major_profiles", 1)))
        if requested_major_profiles is None:
            return minimum
        if requested_major_profiles < minimum:
            raise MangaMakerError(
                "INVALID_PROFILE_COUNT",
                f"{selected} requires at least {minimum} major profile(s)",
                details={"minimum_major_profiles": minimum},
            )
        if mode == "fixed" and "required_major_profiles" in rule and requested_major_profiles != int(rule["required_major_profiles"]):
            raise MangaMakerError(
                "INVALID_PROFILE_COUNT",
                f"{selected} requires exactly {rule['required_major_profiles']} major profile(s)",
                details={"required_major_profiles": rule["required_major_profiles"]},
            )
        return requested_major_profiles

    def _build_creation_queue(self, *, profile_count: int) -> dict[str, Any]:
        return {
            "note_to_user": "The system fills this after the main_character_structure choice. Each item becomes one full major character profile.",
            "auto_generate_from_structure": True,
            "profiles_to_create": [
                {
                    "profile_id": f"char_{i:03d}",
                    "profile_label": f"Main Character {i}",
                    "profile_type": "Major Character",
                    "is_required": True,
                    "uses_template": "character_profile_template",
                    "status": "empty",
                }
                for i in range(1, profile_count + 1)
            ],
            "minor_members_without_full_profiles": [],
        }

    def _relationship_map_available(self, data: dict[str, Any]) -> bool:
        return len(data.get("created_major_character_profiles", [])) >= 2

    def _save(self, *, story_id: str, record: dict[str, Any], data: dict[str, Any]) -> None:
        self.validator.validate_story_file(file_type="characters", data=data, story_id=story_id, version_id=record["version_id"])
        checksum = self.snapshot_service.write_existing_json(path=record["storage_path"], data=data)
        now = datetime.now(timezone.utc).isoformat()
        self.registry.update_file_json_copy(
            story_id=story_id,
            version_id=record["version_id"],
            file_type="characters",
            json_copy=data,
            checksum=checksum,
            now=now,
        )

    def _rename_in_relationship_map(self, data: dict[str, Any], old_name: str, new_name: str) -> None:
        rel_map = data.get("character_relationship_map", {})
        rels: list = rel_map.get("relationships", [])
        if not isinstance(rels, list):
            return
        for rel in rels:
            involved = rel.get("characters_involved", "")
            if not involved or not isinstance(involved, str):
                continue
            parts = [p.strip() for p in involved.split("/")]
            if old_name in parts:
                new_parts = [new_name if p == old_name else p for p in parts]
                rel["characters_involved"] = " / ".join(new_parts)

    def _deep_merge(self, base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
        for key, value in updates.items():
            if isinstance(value, dict) and isinstance(base.get(key), dict):
                self._deep_merge(base[key], value)
            else:
                base[key] = value
        return base
