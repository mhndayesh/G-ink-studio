from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService


class ContinuityService:
    """Foundation continuity checker.

    v0.8 performs deterministic structural checks: filename links, relationship map
    activation, script structure, version sync, and obvious state conflicts.
    """

    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService, validator: ValidationService):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator

    def check_current(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        return self.check_version(story_id, story["current_version_id"], report_type="current_version")

    def check_version(self, story_id: str, version_id: str, report_type: str = "version_candidate") -> dict[str, Any]:
        files = {row["file_type"]: row["json_copy"] for row in self.registry.get_files_for_version(story_id, version_id)}
        if not files:
            raise MangaMakerError("VERSION_NOT_FOUND", f"Version {version_id} not found", status_code=404)
        issues: list[dict[str, Any]] = []
        warnings: list[dict[str, Any]] = []
        required = {"master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script", "version_manifest"}
        missing = sorted(required - set(files))
        if missing:
            issues.append(self._issue("missing_required_files", "critical", f"Version {version_id} is missing required files: {missing}", {"missing": missing}))

        for ft in ["master_story", "characters", "plot_outline", "memory_system", "plot_workspace", "chapter_script"]:
            data = files.get(ft)
            if not data: continue
            if data.get("state_type") != "template_state":
                warnings.append(self._issue("unexpected_state_type", "medium", f"{ft} state_type is not template_state in foundation build", {"state_type": data.get("state_type")}))
            if data.get("version_id") != version_id:
                issues.append(self._issue("mixed_version_file", "critical", f"{ft} version_id does not match {version_id}", {"found": data.get("version_id")}))

        plot_outline = files.get("plot_outline", {})
        if plot_outline:
            if plot_outline.get("master_story_file") != "master_story.json" or plot_outline.get("characters_file") != "characters.json":
                issues.append(self._issue("plot_outline_link_mismatch", "high", "plot_outline linked source filenames are wrong", {}))
            link = plot_outline.get("writing_workspace_link", {})
            if link.get("current_workspace_file") != "plot_workspace.json" or link.get("current_chapter_script_file") != "chapter_script.json":
                issues.append(self._issue("plot_outline_workspace_link_mismatch", "high", "plot_outline writing workspace links are wrong", link))

        characters = files.get("characters", {})
        if characters:
            profiles = characters.get("created_major_character_profiles", [])
            rel = characters.get("character_relationship_map", {})
            if len(profiles) < 2 and rel.get("is_enabled"):
                issues.append(self._issue("relationship_map_enabled_too_early", "critical", "Relationship map is enabled before two real profiles exist", {"profile_count": len(profiles)}))
            if len(profiles) < 2 and rel.get("relationships"):
                issues.append(self._issue("relationship_map_has_fake_relationships", "critical", "Relationship map has relationships before two real profiles exist", {}))

        workspace = files.get("plot_workspace", {})
        if workspace:
            linked = workspace.get("linked_files", {})
            if linked.get("plot_outline_file") != "plot_outline.json":
                issues.append(self._issue("workspace_plot_filename_mismatch", "critical", "plot_workspace must link to plot_outline.json", linked))
            mandatory = workspace.get("mandatory_analysis_after_writing", {})
            if mandatory.get("extract_consequences") is not True or mandatory.get("require_user_confirmation_before_save") is not True:
                issues.append(self._issue("workspace_mandatory_rules_broken", "critical", "plot_workspace must extract consequences and require confirmation", mandatory))

        script = files.get("chapter_script", {})
        if script:
            linked = script.get("linked_files", {})
            if linked.get("plot_outline_file") != "plot_outline.json":
                issues.append(self._issue("script_plot_filename_mismatch", "critical", "chapter_script must link to plot_outline.json", linked))
            if script.get("script_format", {}).get("format_type") != "manga_script":
                issues.append(self._issue("script_format_mismatch", "high", "chapter_script must use manga_script format", script.get("script_format", {})))
            if not isinstance(script.get("pages", []), list):
                issues.append(self._issue("script_pages_invalid", "high", "chapter_script pages must be a list", {}))

        approved = len([i for i in issues if i.get("severity") in {"high", "critical"}]) == 0
        report = {
            "report_id": f"cont_{story_id}_{version_id}_{len(self.registry.list_continuity_reports(story_id))+1:03d}",
            "story_id": story_id,
            "version_id": version_id,
            "report_type": report_type,
            "status": "completed",
            "approved": approved,
            "issues": issues,
            "warnings": warnings,
            "fix_notes": "" if approved else "Fix high/critical issues before marking official.",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        self.registry.create_continuity_report(report)
        return {**report, "issue_count": len(issues), "warning_count": len(warnings), "validation_status": "passed" if approved else "warnings_or_issues"}

    def list_reports(self, story_id: str) -> dict[str, Any]:
        story = self.registry.get_story(story_id)
        if not story:
            raise MangaMakerError("STORY_NOT_FOUND", f"Story {story_id} not found", status_code=404)
        reports = self.registry.list_continuity_reports(story_id)
        return {"story_id": story_id, "reports": reports, "count": len(reports)}

    def _issue(self, code: str, severity: str, message: str, details: dict[str, Any]) -> dict[str, Any]:
        return {"code": code, "severity": severity, "message": message, "details": details}
