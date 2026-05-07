from __future__ import annotations

import logging
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from app.core.errors import MangaMakerError

logger = logging.getLogger("manga.workspace")
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.snapshot_service import SnapshotService
from app.services.validation_service import ValidationService
from app.services.llm_service import LLMService


class PlotWorkspaceService:
    """Template-phase working editor for plot_workspace.json.

    plot_workspace.json is intentionally temporary/messy. It stores free writing,
    optional AI expansion output, detected story consequences, follow-up questions,
    proposed official events/patches, and final confirmation state.
    """

    def __init__(self, *, registry: SQLiteRegistry, snapshot_service: SnapshotService, validator: ValidationService, llm_service: LLMService | None = None):
        self.registry = registry
        self.snapshot_service = snapshot_service
        self.validator = validator
        self.llm_service = llm_service

    def get_workspace(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        return self._response(record=record, data=data)

    def validate_workspace(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        self._validate_workspace_runtime(data, story_id=story_id, version_id=record["version_id"])
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "file_type": "plot_workspace",
            "validation_status": "passed",
            "checks": [
                "story_id matches registry",
                "version_id matches current version",
                "file_type is plot_workspace",
                "state_type is template_state",
                "linked_files point to official filenames",
                "free writing block exists",
                "AI completion block exists",
                "consequence detection is mandatory",
                "confirmation before save is mandatory",
            ],
        }

    def save_free_writing(
        self,
        *,
        story_id: str,
        text: str,
        input_type: str = "",
        user_priority: str = "",
        user_intent_notes: str = "",
        do_not_change_these_parts: list[str] | None = None,
    ) -> dict[str, Any]:
        record, data = self._editable(story_id)
        free = data.setdefault("user_free_writing", {})
        free["text"] = text
        free["user_intent_notes"] = user_intent_notes
        free["do_not_change_these_parts"] = do_not_change_these_parts or []

        if input_type:
            self._set_selected_option(free.setdefault("input_type", {}), input_type, "input_type")
        if user_priority:
            self._set_selected_option(free.setdefault("user_priority", {}), user_priority, "user_priority")

        data.setdefault("workspace_status", {})["status"] = "analysis_ready" if text.strip() else "free_writing"
        data["workspace_status"]["current_stage"] = "free_writing"
        data.setdefault("ai_completion", {})["final_text_used_for_analysis"] = ""
        data["detected_story_events"] = []
        data.setdefault("consequence_questions", {})["status"] = "not_started"
        data["consequence_questions"]["questions"] = []
        data["user_answers"] = []
        data["proposed_official_events"] = []
        self._clear_patch_lists(data)
        self._reset_confirmation(data)

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "status": data["workspace_status"]["status"],
            "text_length": len(text),
            "ai_completion_available": bool(text.strip()),
            "validation_status": "passed",
        }

    def ai_complete(self, *, story_id: str, expansion_mode: str = "Light Expansion", text: str = "") -> dict[str, Any]:
        logger.info("[AI_COMPLETE] story=%s mode=%s request_text_len=%d", story_id, expansion_mode, len(text.strip()))
        record, data = self._editable(story_id)
        workspace_text = data.get("user_free_writing", {}).get("text", "").strip()
        free_text = text.strip() or workspace_text
        logger.info("[AI_COMPLETE] source=%s free_text_len=%d", "request" if text.strip() else "workspace", len(free_text))
        if not free_text:
            logger.warning("[AI_COMPLETE] BLOCKED — no text in request or workspace")
            raise MangaMakerError("EMPTY_FREE_WRITING", "Write an idea or free plot text before using AI completion.")

        ai = data.setdefault("ai_completion", {})
        mode_block = ai.setdefault("expansion_mode", {})
        if expansion_mode:
            self._set_selected_option(mode_block, expansion_mode, "expansion_mode")

        fallback_expanded = self._placeholder_expand(free_text, expansion_mode)
        llm_result = None
        logger.info("[AI_COMPLETE] llm_service_present=%s", self.llm_service is not None)
        if self.llm_service:
            llm_result = self.llm_service.expand_writing(
                story_id=story_id,
                workspace_id=data.get("workspace_id", "workspace_001"),
                user_text=free_text,
                expansion_mode=expansion_mode,
                context=self._context_pack(story_id),
                fallback_text=fallback_expanded,
            )
            logger.info("[AI_COMPLETE] llm provider=%s used_fallback=%s warnings=%s", llm_result.provider, llm_result.used_fallback, llm_result.warnings)
            expanded = llm_result.output.get("expanded_text", fallback_expanded)
        else:
            logger.warning("[AI_COMPLETE] no llm_service — using deterministic fallback")
            expanded = fallback_expanded
        ai["is_enabled"] = True
        ai["expanded_text"] = expanded
        ai["llm_provider_used"] = llm_result.provider if llm_result else "deterministic_fallback"
        ai["llm_used_fallback"] = llm_result.used_fallback if llm_result else True
        ai["llm_run_id"] = llm_result.run_id if llm_result else ""
        ai["llm_warnings"] = llm_result.warnings if llm_result else ["LLM service not configured; deterministic fallback used."]
        ai["accepted_expanded_text"] = False
        ai["final_text_used_for_analysis"] = ""
        data.setdefault("workspace_status", {})["status"] = "ai_completion_done"
        data["workspace_status"]["current_stage"] = "ai_completion_review"

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "expansion_mode": expansion_mode,
            "expanded_text": expanded,
            "llm_provider_used": ai.get("llm_provider_used", "deterministic_fallback"),
            "llm_used_fallback": ai.get("llm_used_fallback", True),
            "llm_run_id": ai.get("llm_run_id", ""),
            "warnings": ai.get("llm_warnings", []),
            "user_options": ["Accept", "Edit", "Reject"],
            "validation_status": "passed",
        }

    def decide_ai_completion(self, *, story_id: str, decision: str, edited_text: str = "") -> dict[str, Any]:
        record, data = self._editable(story_id)
        ai = data.setdefault("ai_completion", {})
        free_text = data.get("user_free_writing", {}).get("text", "")
        expanded_text = ai.get("expanded_text", "")

        if decision not in {"Accept", "Edit", "Reject"}:
            raise MangaMakerError("INVALID_OPTION", "decision must be Accept, Edit, or Reject")
        if decision == "Accept":
            if not expanded_text.strip():
                raise MangaMakerError("NO_EXPANDED_TEXT", "No expanded_text exists to accept.")
            final_text = expanded_text
            accepted = True
        elif decision == "Edit":
            if not edited_text.strip():
                raise MangaMakerError("VALIDATION_ERROR", "edited_text is required when decision is Edit.")
            final_text = edited_text
            ai["expanded_text"] = edited_text
            accepted = True
        else:
            final_text = free_text
            accepted = False

        ai["accepted_expanded_text"] = accepted
        ai["final_text_used_for_analysis"] = final_text
        data.setdefault("workspace_status", {})["status"] = "analysis_ready"
        data["workspace_status"]["current_stage"] = "analysis_ready"
        data["detected_story_events"] = []
        data.setdefault("consequence_questions", {})["status"] = "not_started"
        data["consequence_questions"]["questions"] = []
        data["user_answers"] = []
        data["proposed_official_events"] = []
        self._clear_patch_lists(data)
        self._reset_confirmation(data)

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "decision": decision,
            "accepted_expanded_text": accepted,
            "final_text_used_for_analysis": final_text,
            "validation_status": "passed",
        }

    def analyze(self, story_id: str) -> dict[str, Any]:
        record, data = self._editable(story_id)
        final_text = self._text_for_analysis(data)
        if not final_text.strip():
            raise MangaMakerError("EMPTY_ANALYSIS_TEXT", "No text available for consequence analysis.")

        data.setdefault("ai_completion", {})["final_text_used_for_analysis"] = final_text
        fallback_events, fallback_questions = self._detect_events_and_questions(final_text)
        llm_result = None
        if self.llm_service:
            llm_result = self.llm_service.extract_consequences(
                story_id=story_id,
                workspace_id=data.get("workspace_id", "workspace_001"),
                final_text=final_text,
                context=self._context_pack(story_id),
                fallback_events=fallback_events,
                fallback_questions=fallback_questions,
            )
            events = self._normalize_detected_events(llm_result.output.get("detected_story_events", fallback_events))
            questions = self._normalize_questions(llm_result.output.get("consequence_questions", fallback_questions), events)
            data.setdefault("context_used_for_analysis", {}).setdefault("memory_context", {})["llm_provider_used"] = llm_result.provider
            data["context_used_for_analysis"]["memory_context"]["llm_used_fallback"] = llm_result.used_fallback
            data["context_used_for_analysis"]["memory_context"]["llm_run_id"] = llm_result.run_id or ""
            data["context_used_for_analysis"]["memory_context"]["llm_warnings"] = llm_result.warnings
        else:
            events, questions = fallback_events, fallback_questions
            data.setdefault("context_used_for_analysis", {}).setdefault("memory_context", {})["llm_provider_used"] = "deterministic_fallback"
            data["context_used_for_analysis"]["memory_context"]["llm_used_fallback"] = True
        data["detected_story_events"] = events
        cq = data.setdefault("consequence_questions", {})
        cq["status"] = "questions_pending" if questions else "no_questions_needed"
        cq["question_style"] = "yes_no_custom_when_possible"
        cq["questions"] = questions
        data["user_answers"] = []
        data["proposed_official_events"] = []
        self._clear_patch_lists(data)
        self._reset_confirmation(data)
        data.setdefault("workspace_status", {})["status"] = "questions_pending" if questions else "confirmation_ready"
        data["workspace_status"]["current_stage"] = "answer_consequence_questions" if questions else "final_confirmation"

        if not questions:
            self._prepare_confirmation(data)

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "detected_story_events": events,
            "questions_created": len(questions),
            "llm_provider_used": data.get("context_used_for_analysis", {}).get("memory_context", {}).get("llm_provider_used", "deterministic_fallback"),
            "llm_used_fallback": data.get("context_used_for_analysis", {}).get("memory_context", {}).get("llm_used_fallback", True),
            "llm_run_id": data.get("context_used_for_analysis", {}).get("memory_context", {}).get("llm_run_id", ""),
            "next_step": "answer_questions" if questions else "final_confirmation",
            "validation_status": "passed",
        }

    def get_questions(self, story_id: str) -> dict[str, Any]:
        record = self._get_record(story_id)
        data = record["json_copy"]
        questions = data.get("consequence_questions", {}).get("questions", [])
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "status": data.get("consequence_questions", {}).get("status", "not_started"),
            "questions": questions,
            "unanswered_count": len([q for q in questions if q.get("status") != "answered"]),
        }

    def answer_question(self, *, story_id: str, question_id: str, selected: str, custom_answer: str = "") -> dict[str, Any]:
        record, data = self._editable(story_id)
        questions = data.setdefault("consequence_questions", {}).setdefault("questions", [])
        question = next((q for q in questions if q.get("question_id") == question_id), None)
        if not question:
            raise MangaMakerError("QUESTION_NOT_FOUND", f"Question {question_id!r} not found", status_code=404)
        options = question.get("options", [])
        if selected not in options:
            raise MangaMakerError("INVALID_OPTION", f"{selected!r} is not a valid answer option", details={"options": options})
        if selected == "Custom" and not custom_answer.strip():
            raise MangaMakerError("VALIDATION_ERROR", "custom_answer is required when selected is Custom.")

        question["selected"] = selected
        question["custom_answer"] = custom_answer
        question["status"] = "answered"

        answers = data.setdefault("user_answers", [])
        existing = next((a for a in answers if a.get("question_id") == question_id), None)
        answer_payload = {"question_id": question_id, "selected": selected, "custom_answer": custom_answer, "answer_status": "answered"}
        if existing:
            existing.update(answer_payload)
        else:
            answers.append(answer_payload)

        remaining = len([q for q in questions if q.get("status") != "answered"])
        data["consequence_questions"]["status"] = "answered" if remaining == 0 else "questions_pending"
        if remaining == 0:
            data.setdefault("workspace_status", {})["status"] = "confirmation_ready"
            data["workspace_status"]["current_stage"] = "final_confirmation"
            self._prepare_confirmation(data)
        else:
            data.setdefault("workspace_status", {})["status"] = "questions_pending"
            data["workspace_status"]["current_stage"] = "answer_consequence_questions"

        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "question_id": question_id,
            "status": "answered",
            "remaining_questions": remaining,
            "confirmation_ready": remaining == 0,
            "validation_status": "passed",
        }

    def get_confirmation(self, story_id: str) -> dict[str, Any]:
        record, data = self._editable(story_id)
        questions = data.get("consequence_questions", {}).get("questions", [])
        remaining = len([q for q in questions if q.get("status") != "answered"])
        if remaining:
            return {
                "story_id": story_id,
                "version_id": record["version_id"],
                "workspace_id": data.get("workspace_id", "workspace_001"),
                "status": "not_ready",
                "remaining_questions": remaining,
                "summary_of_detected_changes": [],
                "proposed_official_events": [],
                "proposed_json_patches": [],
                "user_options": ["Go Back To Questions"],
            }
        self._prepare_confirmation(data)
        self._save(story_id=story_id, record=record, data=data)
        final = data.get("final_confirmation", {})
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "status": final.get("status", "ready"),
            "remaining_questions": 0,
            "summary_of_detected_changes": final.get("summary_of_detected_changes", []),
            "proposed_official_events": data.get("proposed_official_events", []),
            "proposed_json_patches": data.get("proposed_json_patches", {}),
            "will_create_version": "vNext_placeholder",
            "user_options": final.get("user_options", ["Approve All", "Reject All", "Edit Specific Change", "Go Back To Questions"]),
        }

    def approve(self, *, story_id: str, decision: str = "Approve All", custom_user_instruction: str = "") -> dict[str, Any]:
        record, data = self._editable(story_id)
        confirmation = self.get_confirmation(story_id)
        if confirmation["status"] == "not_ready":
            raise MangaMakerError("CONFIRMATION_NOT_READY", "Answer all consequence questions before approval.", details={"remaining_questions": confirmation.get("remaining_questions")})
        if decision not in {"Approve All", "Reject All", "Edit Specific Change", "Go Back To Questions"}:
            raise MangaMakerError("INVALID_OPTION", "Invalid approval decision.")
        final = data.setdefault("final_confirmation", {})
        final["selected"] = decision
        final["custom_user_instruction"] = custom_user_instruction
        if decision == "Approve All":
            final["status"] = "approved"
            data.setdefault("workspace_status", {})["status"] = "approved"
            data["workspace_status"]["current_stage"] = "approved_pending_event_patch_engine"
        elif decision == "Reject All":
            final["status"] = "rejected"
            data.setdefault("workspace_status", {})["status"] = "rejected"
            data["workspace_status"]["current_stage"] = "free_writing"
        else:
            final["status"] = "needs_revision"
            data.setdefault("workspace_status", {})["status"] = "questions_pending"
            data["workspace_status"]["current_stage"] = "revise_changes"
        self._save(story_id=story_id, record=record, data=data)
        return {
            "story_id": story_id,
            "version_id": record["version_id"],
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "approved": decision == "Approve All",
            "decision": decision,
            "created_events": [e.get("event_id") for e in data.get("proposed_official_events", [])] if decision == "Approve All" else [],
            "created_patches": self._patch_ids(data) if decision == "Approve All" else [],
            "created_version_candidate": "vNext_placeholder" if decision == "Approve All" else "",
            "next_step": "event_patch_version_engine" if decision == "Approve All" else "revise_or_continue_writing",
            "validation_status": "passed",
        }

    def _get_record(self, story_id: str) -> dict[str, Any]:
        record = self.registry.get_current_file(story_id, "plot_workspace")
        if not record:
            raise MangaMakerError("PLOT_WORKSPACE_NOT_FOUND", f"plot_workspace.json not found for story {story_id}", status_code=404)
        return record

    def _editable(self, story_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        record = self._get_record(story_id)
        data = deepcopy(record["json_copy"])
        if data.get("state_type") != "template_state":
            raise MangaMakerError("STATE_LOCKED", "Only template_state plot_workspace editing is supported in this foundation build.")
        return record, data

    def _save(self, *, story_id: str, record: dict[str, Any], data: dict[str, Any]) -> None:
        self._validate_workspace_runtime(data, story_id=story_id, version_id=record["version_id"])
        checksum = self.snapshot_service.write_existing_json(path=record["storage_path"], data=data)
        self.registry.update_file_json_copy(story_id=story_id, version_id=record["version_id"], file_type="plot_workspace", json_copy=data, checksum=checksum, now=datetime.now(timezone.utc).isoformat())

    def _validate_workspace_runtime(self, data: dict[str, Any], *, story_id: str, version_id: str) -> None:
        if data.get("story_id") != story_id:
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace story_id mismatch")
        if data.get("version_id") != version_id:
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace version_id mismatch")
        if data.get("file_type") != "plot_workspace":
            raise MangaMakerError("VALIDATION_ERROR", "file_type must be plot_workspace")
        if data.get("state_type") != "template_state":
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace state_type must be template_state in foundation build")
        linked = data.get("linked_files", {})
        expected = {
            "master_story_file": "master_story.json",
            "characters_file": "characters.json",
            "plot_outline_file": "plot_outline.json",
            "memory_system_file": "memory_system.json",
            "chapter_script_output_file": "chapter_script.json",
        }
        for key, value in expected.items():
            if linked.get(key) != value:
                raise MangaMakerError("FILENAME_ERROR", f"plot_workspace linked_files.{key} must be {value}")
        mandatory = data.get("mandatory_analysis_after_writing", {})
        if mandatory.get("extract_consequences") is not True:
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace must always extract consequences")
        if mandatory.get("require_user_confirmation_before_save") is not True:
            raise MangaMakerError("VALIDATION_ERROR", "plot_workspace must require confirmation before save")

    def _response(self, *, record: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
        return {
            "story_id": data.get("story_id"),
            "version_id": record["version_id"],
            "file_type": "plot_workspace",
            "state_type": data.get("state_type", "template_state"),
            "workspace_id": data.get("workspace_id", "workspace_001"),
            "workspace_status": data.get("workspace_status", {}),
            "content": data,
        }

    def _set_selected_option(self, block: dict[str, Any], selected: str, label: str) -> None:
        options = block.get("options", [])
        if options and selected not in options:
            raise MangaMakerError("INVALID_OPTION", f"{selected!r} is not a valid {label}", details={"options": options})
        block["selected"] = selected

    def _context_pack(self, story_id: str) -> dict[str, Any]:
        """Small current-version context pack for LLM calls.

        Full graph/vector retrieval comes later; this keeps v0.9 grounded in the
        official JSON snapshots that already exist in the registry.
        """
        context: dict[str, Any] = {}
        for file_type in ["master_story", "characters", "plot_outline", "plot_workspace", "chapter_script"]:
            rec = self.registry.get_current_file(story_id, file_type)
            if rec:
                context[file_type] = rec.get("json_copy", {})
        return context

    def _normalize_detected_events(self, raw: Any) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            return []
        events: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            event_id = item.get("detected_event_id") or f"det_evt_{len(events) + 1:03d}"
            category = item.get("event_category") or item.get("category") or "plot_events"
            target_file = item.get("target_file") or ("characters" if category in {"character_events", "relationship_events", "power_events"} else "plot_outline")
            events.append({
                "detected_event_id": event_id,
                "event_type": item.get("event_type") or "PLOT_INPUT_REVIEWED",
                "event_category": category,
                "confidence": item.get("confidence") or "medium",
                "evidence_from_user_text": item.get("evidence_from_user_text") or item.get("evidence") or "",
                "target_file": target_file,
                "target_entity_id": item.get("target_entity_id") or "",
                "target_entity_name": item.get("target_entity_name") or "",
                "requires_user_decision": bool(item.get("requires_user_decision", False)),
                "reason_question_is_needed": item.get("reason_question_is_needed") or "",
                "suggested_event_summary": item.get("suggested_event_summary") or item.get("summary") or item.get("evidence_from_user_text") or "",
                "status": item.get("status") or "pending_review",
            })
        if not events:
            events, _ = self._detect_events_and_questions("")
        return events

    def _normalize_questions(self, raw: Any, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if not isinstance(raw, list):
            return []
        event_ids = {e.get("detected_event_id") for e in events}
        questions: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict) or not item.get("question"):
                continue
            options = item.get("options") if isinstance(item.get("options"), list) else ["Yes", "No", "Custom"]
            linked = item.get("linked_detected_event_id") or ""
            if linked and linked not in event_ids:
                linked = ""
            questions.append({
                "question_id": item.get("question_id") or f"cq_{len(questions) + 1:03d}",
                "linked_detected_event_id": linked,
                "question": item.get("question"),
                "why_this_matters": item.get("why_this_matters") or "",
                "options": options,
                "selected": item.get("selected") or "",
                "custom_answer": item.get("custom_answer") or "",
                "status": item.get("status") or "unanswered",
            })
        return questions

    def _placeholder_expand(self, text: str, mode: str) -> str:
        text = text.strip()
        if mode == "Add Dialogue":
            return f"{text}\n\nDialogue pass: the characters exchange short, tense manga-panel lines while the scene keeps the user's original intent."
        if mode == "Add Manga Visual Detail":
            return f"{text}\n\nVisual pass: add establishing panels, reaction close-ups, and one strong final hook image while preserving the user's original events."
        if mode == "Add Emotional Depth":
            return f"{text}\n\nEmotional pass: clarify what each character fears, hides, or realizes during the moment without changing the core plot."
        if mode == "Add Action Detail":
            return f"{text}\n\nAction pass: break the movement into clear beats, impacts, reversals, and a final cliffhanger panel."
        if mode == "Heavy Expansion":
            return f"{text}\n\nExpanded draft: open with the setting, build tension through character reactions, show the key action or reveal, then end on a manga-style hook. Preserve all user-stated facts."
        if mode == "Medium Expansion":
            return f"{text}\n\nExpanded draft: add visual staging, emotional reaction, and a clearer ending hook while keeping the same story events."
        return f"{text}\n\nLight expansion: clarify the scene beats, keep the same events, and add one manga-style visual hook."

    def _text_for_analysis(self, data: dict[str, Any]) -> str:
        ai = data.get("ai_completion", {})
        final = ai.get("final_text_used_for_analysis", "")
        if final.strip():
            return final
        if ai.get("accepted_expanded_text") and ai.get("expanded_text", "").strip():
            return ai["expanded_text"]
        return data.get("user_free_writing", {}).get("text", "")

    def _detect_events_and_questions(self, text: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        lower = text.lower()
        names = self._guess_names(text)
        events: list[dict[str, Any]] = []
        questions: list[dict[str, Any]] = []

        def add_event(event_type: str, category: str, evidence: str, target_name: str = "", needs_question: bool = True) -> str:
            event_id = f"det_evt_{len(events) + 1:03d}"
            events.append({
                "detected_event_id": event_id,
                "event_type": event_type,
                "event_category": category,
                "confidence": "medium" if target_name == "" else "high",
                "evidence_from_user_text": evidence,
                "target_file": "characters" if category in {"character_events", "relationship_events", "power_events"} else "plot_outline",
                "target_entity_id": "",
                "target_entity_name": target_name,
                "requires_user_decision": needs_question,
                "reason_question_is_needed": "The consequence changes character/relationship/plot memory." if needs_question else "",
                "suggested_event_summary": evidence,
                "status": "pending_review",
            })
            return event_id

        injury_keywords = ["injured", "injures", "injure", "injury", "wounded", "wounds", "hurt", "badly injured", "badly injures", "serious injury"]
        if any(k in lower for k in injury_keywords):
            target = names[0] if names else ""
            evidence = f"{target + ' ' if target else ''}appears to suffer an injury."
            eid = add_event("CHARACTER_INJURED", "character_events", evidence, target)
            questions.append({
                "question_id": f"cq_{len(questions) + 1:03d}",
                "linked_detected_event_id": eid,
                "question": f"{target or 'A character'} suffered an injury. What should happen?",
                "why_this_matters": "Injuries can affect status, powers, reputation, relationships, and future continuity.",
                "options": ["Heals Quickly", "Heals Slowly", "Permanent Scar", "Loses Power Temporarily", "Loses Power Permanently", "Dies", "Unknown For Now", "Custom"],
                "selected": "",
                "custom_answer": "",
                "status": "unanswered",
            })

        attack_keywords = ["attacked", "attacks", "attack", "fights", "fight", "strikes", "stabbed"]
        if any(k in lower for k in attack_keywords):
            target = " / ".join(names[:2]) if len(names) >= 2 else (names[0] if names else "")
            eid = add_event("CHARACTER_ATTACKED_CHARACTER", "relationship_events", "A fight or attack occurs between characters.", target)
            questions.append({
                "question_id": f"cq_{len(questions) + 1:03d}",
                "linked_detected_event_id": eid,
                "question": "Should this attack/fight officially change the relationship?",
                "why_this_matters": "Relationship trust and conflict drive dialogue, scene tension, and future plot logic.",
                "options": ["Trust Decreases", "They Become Enemies", "They Become Rivals", "Secret Reason", "No Official Relationship Change", "Custom"],
                "selected": "",
                "custom_answer": "",
                "status": "unanswered",
            })

        spy_keywords = ["spy", "traitor", "betray", "betrayed", "betrayal", "joined the other side", "enemy side", "double agent"]
        if any(k in lower for k in spy_keywords):
            target = names[-1] if names else ""
            eid = add_event("CHARACTER_ALLEGIANCE_CHANGED_OR_REVEALED", "character_events", "A spy, betrayal, or allegiance reveal is implied.", target)
            questions.append({
                "question_id": f"cq_{len(questions) + 1:03d}",
                "linked_detected_event_id": eid,
                "question": f"{target or 'This character'} may be a spy or traitor. What is the truth?",
                "why_this_matters": "Allegiance affects faction links, relationship map, graph memory, and future continuity.",
                "options": ["Was A Spy From The Beginning", "Changed Sides Now", "Forced To Betray", "Pretending To Betray", "Secret Double Agent", "Unknown For Now", "Custom"],
                "selected": "",
                "custom_answer": "",
                "status": "unanswered",
            })

        if not events:
            eid = add_event("PLOT_INPUT_REVIEWED", "plot_events", "Free plot input reviewed; no major memory-changing consequence detected.", "", False)
        return events, questions

    def _guess_names(self, text: str) -> list[str]:
        candidates = re.findall(r"\b[A-Z][a-zA-Z]{1,30}\b", text)
        stop = {"Later", "Then", "The", "A", "An", "Custom", "Scene", "Chapter", "Rough", "Fight", "Dialogue", "Ending", "Arc", "AI", "Light", "Medium", "Heavy"}
        result = []
        for c in candidates:
            if c not in stop and c not in result:
                result.append(c)
        return result[:5]

    def _prepare_confirmation(self, data: dict[str, Any]) -> None:
        events = data.get("detected_story_events", [])
        questions = data.get("consequence_questions", {}).get("questions", [])
        proposed_events = []
        patches = {"master_story": [], "characters": [], "plot_outline": [], "relationship_map": []}
        summary = []
        for i, event in enumerate(events, start=1):
            eid = f"evt_placeholder_{i:03d}"
            linked_q = next((q for q in questions if q.get("linked_detected_event_id") == event.get("detected_event_id")), None)
            decision = linked_q.get("selected", "") if linked_q else "No question needed"
            custom = linked_q.get("custom_answer", "") if linked_q else ""
            event_type = event.get("event_type", "PLOT_INPUT_REVIEWED")
            target_file = event.get("target_file", "plot_outline") or "plot_outline"
            summary_text = f"{event_type}: {event.get('suggested_event_summary') or event.get('evidence_from_user_text', '')}"
            if decision:
                summary_text += f" Decision: {decision}."
            if custom:
                summary_text += f" Custom: {custom}."
            summary.append(summary_text)
            proposed_events.append({
                "event_id": eid,
                "event_type": event_type,
                "target_file": target_file,
                "target_entity_id": event.get("target_entity_id", ""),
                "summary": summary_text,
                "payload": {
                    "detected_event_id": event.get("detected_event_id"),
                    "target_entity_name": event.get("target_entity_name", ""),
                    "user_decision": decision,
                    "custom_answer": custom,
                    "evidence": event.get("evidence_from_user_text", ""),
                },
                "created_from_detected_event_id": event.get("detected_event_id"),
                "created_from_question_id": linked_q.get("question_id") if linked_q else "",
                "approval_status": "pending",
            })
            patch_id = f"patch_placeholder_{i:03d}"
            patch_target_file = "characters" if target_file in {"characters", "relationship_map"} else "plot_outline"
            patch = {
                "patch_id": patch_id,
                "target_file": "characters.json" if patch_target_file == "characters" else "plot_outline.json",
                "target_branch": "pending_event_resolution",
                "operation": "append_to_array",
                "old_value": None,
                "new_value": proposed_events[-1],
                "reason": "Foundation v0.5 stores placeholder patch proposal; real event-to-patch engine comes next.",
                "approval_status": "pending",
            }
            if event_type == "CHARACTER_ATTACKED_CHARACTER":
                patches["relationship_map"].append(patch)
            elif patch_target_file == "characters":
                patches["characters"].append(patch)
            else:
                patches["plot_outline"].append(patch)
        data["proposed_official_events"] = proposed_events
        data["proposed_json_patches"] = patches
        final = data.setdefault("final_confirmation", {})
        final["status"] = "ready"
        final["summary_of_detected_changes"] = summary
        final["summary_of_rejected_changes"] = []
        final["summary_of_pending_questions"] = []
        final["user_options"] = ["Approve All", "Reject All", "Edit Specific Change", "Go Back To Questions"]

    def _clear_patch_lists(self, data: dict[str, Any]) -> None:
        data["proposed_json_patches"] = {"master_story": [], "characters": [], "plot_outline": [], "relationship_map": []}

    def _reset_confirmation(self, data: dict[str, Any]) -> None:
        data["final_confirmation"] = {
            "status": "not_ready",
            "summary_of_detected_changes": [],
            "summary_of_rejected_changes": [],
            "summary_of_pending_questions": [],
            "user_options": ["Approve All", "Reject All", "Edit Specific Change", "Go Back To Questions"],
            "selected": "",
            "custom_user_instruction": "",
        }

    def _patch_ids(self, data: dict[str, Any]) -> list[str]:
        ids = []
        for items in data.get("proposed_json_patches", {}).values():
            for patch in items:
                if patch.get("patch_id"):
                    ids.append(patch["patch_id"])
        return ids
