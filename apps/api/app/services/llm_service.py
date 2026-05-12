from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import Settings
from uuid import uuid4
from app.repositories.sqlite_registry import SQLiteRegistry
from app.services.visual_prompt import STYLE_INSTRUCTION
from app.services.llm_prompts import field_schema_hint
from app.services.thread_ids import backfill_thread_ids, slugify_name, stable_rel_id_from_pair
from app.services.llm_context import clip_text, compact_generation_context

logger = logging.getLogger("manga.llm")


@dataclass
class LLMResult:
    provider: str
    model: str
    used_fallback: bool
    output: dict[str, Any]
    warnings: list[str]
    run_id: str | None = None


class LLMService:
    """Real LLM integration with deterministic fallback.

    This service is intentionally safe for local development:
    - If no API key is configured, it returns deterministic fallback output.
    - If the provider call fails or returns invalid JSON, it returns fallback output.
    - Every call is logged in the dev registry so the workflow is auditable.
    """

    def __init__(self, *, settings: Settings, registry: SQLiteRegistry):
        self.settings = settings
        self.registry = registry

    def status(self) -> dict[str, Any]:
        api_key_present = bool(self.settings.openai_api_key and self.settings.openai_api_key.get_secret_value())
        ready = self.settings.llm_enabled and self.settings.llm_provider == "openai" and api_key_present
        logger.info(
            "[LLM STATUS] enabled=%s provider=%s model=%s api_key_present=%s base_url=%s real_llm_ready=%s",
            self.settings.llm_enabled, self.settings.llm_provider, self.settings.openai_model,
            api_key_present, self.settings.openai_base_url, ready,
        )
        return {
            "llm_enabled": self.settings.llm_enabled,
            "provider": self.settings.llm_provider,
            "model": self.settings.openai_model,
            "api_key_present": api_key_present,
            "real_llm_ready": ready,
            "fallback_mode_available": True,
            "prompt_version": self.settings.llm_prompt_version,
        }

    def extract_script_events(
        self,
        *,
        story_id: str,
        chapter_id: str,
        script_text: str,
        context: dict[str, Any],
    ) -> LLMResult:
        """Extract official-event candidates from a generated chapter script.

        Returns detected_events_from_script — each item shaped like the manual
        keyword extractor's output so ChapterScriptService can swap it in.
        """
        fallback: dict[str, Any] = {
            "detected_events_from_script": [],
            "warnings": ["Real LLM was not used. Returned empty event list."],
        }
        input_payload = {
            "task": "extract_script_events",
            "chapter_id": chapter_id,
            "script_text": script_text[:4000],
            "characters": context.get("characters", [])[:12],
            "current_threads_summary": context.get("plot_threads_summary", {}),
        }
        system = (
            "You are the Manga Maker chapter-script event extractor. "
            "Read the chapter script (panel descriptions, dialogue, narration) and detect "
            "consequential story events: injuries, deaths, allegiance changes, attacks, "
            "power awakenings/losses, location destruction, faction shifts, threat reveals. "
            "RETURN JSON ONLY with key 'detected_events_from_script' — an array. "
            "Each item: { event_type (UPPER_SNAKE_CASE like CHARACTER_INJURED), "
            "confidence ('high'|'medium'|'low'), evidence (short quote/paraphrase from the script), "
            "target_entity_name (optional character/faction/location name) }. "
            "Use only event types that map to story memory; skip cosmetic beats. "
            "Return an empty array if no consequential events are found."
        )
        user = json.dumps(input_payload, ensure_ascii=False)
        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=f"script_extract_{chapter_id}",
            run_type="script_event_extraction",
            input_payload=input_payload,
            system_prompt=system,
            user_prompt=user,
            fallback=fallback,
        )
        out = result.output
        out.setdefault("detected_events_from_script", [])
        out.setdefault("warnings", [])
        result.output = out
        return result

    def generate_manga_script_panels(
        self,
        *,
        story_id: str,
        chapter: dict[str, Any],
        scenes: list[dict[str, Any]],
        final_text: str,
        plot_threads: dict[str, Any],
        characters_context: list[dict[str, Any]],
    ) -> LLMResult:
        """Generate AI-enhanced panel details for every page of a manga chapter.

        Returns pages_enhanced — a list indexed by page_index, each containing
        panels indexed by panel_index with visual/dialogue/action content.
        The ChapterScriptService merges these back into the structural skeleton.
        """
        fallback: dict[str, Any] = {
            "pages_enhanced": [],
            "warnings": ["Real LLM was not used. Panel descriptions remain as structural placeholders."],
        }

        # Compact scene summaries to keep prompt size reasonable.
        compact_scenes = [
            {
                "scene_index": i,
                "scene_id": s.get("scene_id", ""),
                "location": s.get("location", ""),
                "time": s.get("time", ""),
                "characters_present": s.get("characters_present", []),
                "scene_goal": s.get("scene_goal", ""),
                "scene_conflict": s.get("scene_conflict", ""),
                "visual_manga_moment": s.get("visual_manga_moment", ""),
                "panel_mood": s.get("panel_mood", ""),
                "new_information_revealed": s.get("new_information_revealed", ""),
                "ending_beat": s.get("ending_beat", ""),
                "relationship_dynamic_used": s.get("relationship_dynamic_used", ""),
            }
            for i, s in enumerate(scenes[:8])
        ]
        main_thread = plot_threads.get("main_plot_thread", {})
        compact_threads = {
            "main_goal": str(main_thread.get("goal", ""))[:160],
            "character_arcs": [
                {"id": a.get("character_id", ""), "state": str(a.get("starting_state", ""))[:80]}
                for a in plot_threads.get("character_arc_threads", [])[:4]
                if isinstance(a, dict)
            ],
            "threat_threads": [
                {"name": t.get("threat_id_or_name", ""), "hint": str(t.get("first_hint", ""))[:80]}
                for t in plot_threads.get("threat_threads", [])[:3]
                if isinstance(t, dict)
            ],
        }

        allowed_speakers = [c["name"] for c in characters_context if c.get("name")]
        input_payload = {
            "task": "manga_script_panel_generation",
            "chapter": {
                "chapter_id": chapter.get("chapter_id", ""),
                "chapter_title": chapter.get("chapter_title", ""),
                "chapter_purpose": chapter.get("chapter_purpose", ""),
                "summary": str(chapter.get("summary", ""))[:400],
                "main_conflict": str(chapter.get("main_conflict", ""))[:300],
                "emotional_beat": str(chapter.get("emotional_beat", ""))[:200],
                "ending_cliffhanger": str(chapter.get("ending_cliffhanger", ""))[:200],
            },
            "scenes": compact_scenes,
            "workspace_text": final_text[:800],
            "plot_threads": compact_threads,
            "characters": characters_context,
            "allowed_speakers": allowed_speakers,
        }
        speaker_rule = (
            f"IMPORTANT — speaker_name in every dialogue entry MUST be exactly one of these names: "
            f"{allowed_speakers}. "
            "You may also use 'Narrator' for caption/narration text. "
            "For unnamed background extras use 'Background Character'. "
            "Do NOT invent any other speaker names."
        ) if allowed_speakers else (
            "Use 'Narrator' for narration text and 'Background Character' for unnamed extras."
        )
        system = (
            "You are the Manga Maker panel script generator. "
            "Given a chapter's scene cards, generate creative and detailed manga panel content for each page. "
            "RETURN JSON ONLY with top-level key 'pages_enhanced' — an array. "
            "Each element: { page_index (int, 0-based matching scene index), page_mood (string), "
            "panels (array of { panel_index (int, 0-based, up to 4), "
            "visual (what is drawn — ONE short clause; only things visibly on the page; no colour names, no lighting/mood words — the art is black and white), "
            "character_action (what the character physically does), "
            "background_details (environment details), "
            "facial_expression (emotion shown on face), "
            "pose_or_body_language (body posture), "
            "dialogue (array of { speaker_name, text (short, manga-panel length), speech_bubble_type (Normal/Shout/Whisper/Thought/Narration/Off-Screen) }), "
            "narration (short caption box text, optional), "
            "sound_effects (array of { sfx_text, sfx_meaning }), "
            "mood (scene mood string), "
            "pacing (one of: Fast/Normal/Slow/Dramatic Pause/Action Burst) } ) }. "
            "Generate panels for panel_index 0-4 (5 panels per page). "
            "Panel 0: wide establishing shot. Panel 1: character introduction/context. "
            "Panel 2: core conflict/action. Panel 3: reaction/revelation. Panel 4: ending hook/cliffhanger. "
            "Keep dialogue short (under 20 words per bubble). "
            "Use the scene's visual_manga_moment, conflict, and ending_beat to drive panel content. "
            f"{speaker_rule} "
            "Do not generate violent, explicit, or harmful content. Keep output general-audience manga."
        )
        user = json.dumps(input_payload, ensure_ascii=False)
        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=f"script_panels_{chapter.get('chapter_id', 'unknown')}",
            run_type="manga_script_panels",
            input_payload=input_payload,
            system_prompt=system,
            user_prompt=user,
            fallback=fallback,
        )
        out = result.output
        out.setdefault("pages_enhanced", [])
        out.setdefault("warnings", [])
        result.output = out
        return result

    def expand_writing(
        self,
        *,
        story_id: str,
        workspace_id: str,
        user_text: str,
        expansion_mode: str,
        context: dict[str, Any],
        fallback_text: str,
    ) -> LLMResult:
        fallback = {
            "expanded_text": fallback_text,
            "preserved_intent_summary": "Deterministic fallback preserved the user's stated events.",
            "added_details": ["fallback expansion"],
            "warnings": ["Real LLM was not used."],
        }
        input_payload = {
            "task": "ai_completion_expand_writing",
            "user_text": user_text,
            "expansion_mode": expansion_mode,
            "context": context,
        }
        system = (
            "You are the Manga Maker System LLM layer. Expand the user's manga plot writing while preserving intent. "
            "Return JSON only with keys: expanded_text, preserved_intent_summary, added_details, warnings. "
            "Do not create official events. Do not overwrite memory. "
            "Do not generate violent, explicit, or harmful content. Keep output appropriate for a general audience manga."
        )
        user = json.dumps(input_payload, ensure_ascii=False)
        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=workspace_id,
            run_type="ai_completion",
            input_payload=input_payload,
            system_prompt=system,
            user_prompt=user,
            fallback=fallback,
        )
        # Defensive shape repair.
        out = result.output
        out.setdefault("expanded_text", fallback_text)
        out.setdefault("preserved_intent_summary", "")
        out.setdefault("added_details", [])
        out.setdefault("warnings", [])
        result.output = out
        return result

    def extract_consequences(
        self,
        *,
        story_id: str,
        workspace_id: str,
        final_text: str,
        context: dict[str, Any],
        fallback_events: list[dict[str, Any]],
        fallback_questions: list[dict[str, Any]],
    ) -> LLMResult:
        fallback = {
            "detected_story_events": fallback_events,
            "consequence_questions": fallback_questions,
            "continuity_warnings": [],
            "warnings": ["Real LLM was not used."],
        }
        input_payload = {
            "task": "consequence_extraction",
            "final_text_used_for_analysis": final_text,
            "context": context,
        }
        system = (
            "You are the Manga Maker System consequence extractor. Read the user's manga plot text and current story context. "
            "Return JSON only with keys: detected_story_events, consequence_questions, continuity_warnings, warnings. "
            "Ask only necessary follow-up questions. Use yes/no/custom style options where possible. "
            "Do not generate violent, explicit, or harmful content. Keep output appropriate for a general audience manga."
            "Do not create official events. Do not propose final patches."
        )
        user = json.dumps(input_payload, ensure_ascii=False)
        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=workspace_id,
            run_type="consequence_extraction",
            input_payload=input_payload,
            system_prompt=system,
            user_prompt=user,
            fallback=fallback,
        )
        out = result.output
        out.setdefault("detected_story_events", fallback_events)
        out.setdefault("consequence_questions", fallback_questions)
        out.setdefault("continuity_warnings", [])
        out.setdefault("warnings", [])
        result.output = out
        return result

    def _call_json_or_fallback(
        self,
        *,
        story_id: str,
        workspace_id: str | None,
        run_type: str,
        input_payload: dict[str, Any],
        system_prompt: str,
        user_prompt: str,
        fallback: dict[str, Any],
        timeout_override: float | None = None,
    ) -> LLMResult:
        now = datetime.now(timezone.utc).isoformat()
        run_id = f"llm_{uuid4().hex[:12]}"
        logger.info("[LLM CALL] run_id=%s story=%s run_type=%s", run_id, story_id, run_type)
        status = self.status()
        if not status["real_llm_ready"]:
            logger.warning("[LLM FALLBACK] run_id=%s reason=real_llm_not_ready", run_id)
            output = dict(fallback)
            output.setdefault("warnings", [])
            output["warnings"] = list(output["warnings"]) + ["Fallback used because real LLM is not configured."]
            self.registry.create_llm_run({
                "llm_run_id": run_id,
                "story_id": story_id,
                "workspace_id": workspace_id,
                "run_type": run_type,
                "model_name": self.settings.openai_model,
                "prompt_version": self.settings.llm_prompt_version,
                "input_payload": input_payload,
                "output_payload": output,
                "status": "fallback",
                "error_message": "Real LLM not configured.",
                "created_at": now,
                "completed_at": now,
            })
            return LLMResult("deterministic_fallback", self.settings.openai_model, True, output, output.get("warnings", []), run_id)

        try:
            logger.info("[LLM REQUEST] run_id=%s calling real LLM url=%s model=%s", run_id, self.settings.openai_base_url, self.settings.openai_model)
            output = self._openai_responses_json(system_prompt=system_prompt, user_prompt=user_prompt, timeout=timeout_override)
            logger.info("[LLM SUCCESS] run_id=%s output_keys=%s", run_id, list(output.keys()))
            self.registry.create_llm_run({
                "llm_run_id": run_id,
                "story_id": story_id,
                "workspace_id": workspace_id,
                "run_type": run_type,
                "model_name": self.settings.openai_model,
                "prompt_version": self.settings.llm_prompt_version,
                "input_payload": input_payload,
                "output_payload": output,
                "status": "success",
                "error_message": "",
                "created_at": now,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            return LLMResult("openai", self.settings.openai_model, False, output, output.get("warnings", []), run_id)
        except Exception as exc:  # local foundation must keep running
            logger.error("[LLM ERROR] run_id=%s error=%s", run_id, exc, exc_info=True)
            output = dict(fallback)
            output.setdefault("warnings", [])
            output["warnings"] = list(output["warnings"]) + [f"Fallback used after LLM error: {exc}"]
            self.registry.create_llm_run({
                "llm_run_id": run_id,
                "story_id": story_id,
                "workspace_id": workspace_id,
                "run_type": run_type,
                "model_name": self.settings.openai_model,
                "prompt_version": self.settings.llm_prompt_version,
                "input_payload": input_payload,
                "output_payload": output,
                "status": "fallback_after_error",
                "error_message": str(exc),
                "created_at": now,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            })
            return LLMResult("deterministic_fallback", self.settings.openai_model, True, output, output.get("warnings", []), run_id)

    def _openai_responses_json(self, *, system_prompt: str, user_prompt: str, timeout: float | None = None) -> dict[str, Any]:
        key = self.settings.openai_api_key.get_secret_value() if self.settings.openai_api_key else ""
        headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        payload = {
            "model": self.settings.openai_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        url = self.settings.openai_base_url.rstrip("/") + "/chat/completions"
        actual_timeout = timeout if timeout is not None else self.settings.llm_timeout_seconds
        logger.info("[LLM HTTP] POST %s model=%s timeout=%s", url, self.settings.openai_model, actual_timeout)
        with httpx.Client(timeout=actual_timeout) as client:
            response = client.post(url, headers=headers, json=payload)
            logger.info("[LLM HTTP] response status=%s", response.status_code)
            response.raise_for_status()
            data = response.json()
        text = self._extract_response_text(data)
        logger.info("[LLM HTTP] extracted text length=%d", len(text))
        if not text:
            raise ValueError("LLM response had no output text")
        json_text = self._strip_to_json(text)
        logger.info("[LLM HTTP] json_text length=%d preview=%s", len(json_text), json_text[:120])
        parsed = json.loads(json_text)
        if not isinstance(parsed, dict):
            raise ValueError("LLM JSON output must be an object")
        return parsed

    def _extract_response_text(self, data: dict[str, Any]) -> str:
        choices = data.get("choices", [])
        if not choices:
            return ""
        message = choices[0].get("message", {})
        content = message.get("content", "")
        return content

    def _strip_to_json(self, text: str) -> str:
        """Remove <think>...</think> blocks (Qwen3 etc.) then extract the first JSON object."""
        import re
        # Strip thinking blocks
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
        # Find first { ... } spanning the whole remaining content
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start : end + 1]
        return text

    def _build_scene_fallback(
        self,
        *,
        context: dict[str, Any],
        generation_hints: dict[str, Any],
        partial_input: dict[str, Any],
    ) -> dict[str, Any]:
        plot_data = context.get("plot_outline", {})
        chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", []) or []
        scenes = plot_data.get("scene_cards", {}).get("scenes", []) or []
        target_ids = generation_hints.get("chapter_ids", []) or partial_input.get("selected_chapter_ids", [])
        chapter_map = {ch.get("chapter_id"): ch for ch in chapters if isinstance(ch, dict) and ch.get("chapter_id")}
        if not target_ids:
            target_ids = list(chapter_map.keys())[:1]
        scenes_per_chapter = int(generation_hints.get("scenes_per_chapter") or 3)
        scenes_per_chapter = max(1, min(scenes_per_chapter, 6))

        generated: list[dict[str, Any]] = []
        for cid in target_ids:
            chapter = chapter_map.get(cid)
            if not chapter:
                continue
            existing = [s for s in scenes if isinstance(s, dict) and s.get("chapter_id") == cid]
            start_order = len(existing) + 1
            chapter_title = chapter.get("chapter_title") or f"Chapter {chapter.get('chapter_number', '')}".strip()
            chapter_summary = chapter.get("summary") or chapter.get("chapter_purpose") or ""
            characters = chapter.get("characters_present", [])
            if not isinstance(characters, list):
                characters = [str(characters)] if characters else []
            beats = [
                ("Opening pressure", "Establish the location, mood, and immediate objective for the chapter."),
                ("Core confrontation", "Push the chapter conflict into a concrete choice, chase, argument, discovery, or fight."),
                ("Exit hook", "End with a visual turn, new clue, cost, or cliffhanger that carries into the next chapter."),
                ("Aftershock", "Show the consequence of the confrontation and lock the next story question."),
                ("Quiet contrast", "Give the reader an emotional breath while preserving tension."),
                ("Final sting", "Close the chapter with a sharp manga-panel reveal."),
            ]
            for offset in range(scenes_per_chapter):
                order = start_order + offset
                label, purpose = beats[offset % len(beats)]
                generated.append({
                    "scene_id": "",
                    "chapter_id": cid,
                    "scene_order": order,
                    "location": "Key chapter location",
                    "time": "During the chapter sequence",
                    "characters_present": characters,
                    "scene_goal": f"{label} for Ch.{chapter.get('chapter_number', '?')} — {chapter_title}. {purpose}",
                    "scene_conflict": chapter.get("main_conflict") or f"Conflict escalates around: {chapter_summary[:160]}",
                    "relationship_dynamic_used": "",
                    "new_information_revealed": chapter.get("twist_or_hook") or chapter.get("ending_cliffhanger") or "",
                    "action_or_dialogue_focus": "Balance character reaction with plot movement.",
                    "visual_manga_moment": chapter.get("ending_cliffhanger") or f"A strong visual beat crystallizes the purpose of {chapter_title}.",
                    "panel_mood": chapter.get("emotional_beat") or "Tense",
                    "ending_beat": chapter.get("ending_cliffhanger") or "The scene ends with a clear forward hook.",
                    "custom_scene_details": "Deterministic fallback scene. Review and polish before script generation.",
                })
        return {"scenes_for_chapter": generated}

    def _build_scene_recommendation_fallback(
        self,
        *,
        context: dict[str, Any],
        generation_hints: dict[str, Any],
        partial_input: dict[str, Any],
    ) -> dict[str, Any]:
        plot_data = context.get("plot_outline", {})
        chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", []) or []
        scenes = plot_data.get("scene_cards", {}).get("scenes", []) or []
        target_ids = generation_hints.get("chapter_ids", []) or partial_input.get("selected_chapter_ids", [])
        chapter_map = {ch.get("chapter_id"): ch for ch in chapters if isinstance(ch, dict) and ch.get("chapter_id")}
        if not target_ids:
            target_ids = list(chapter_map.keys())

        recommendations: list[dict[str, Any]] = []
        for cid in target_ids:
            chapter = chapter_map.get(cid)
            if not chapter:
                continue
            current_scene_count = len([s for s in scenes if isinstance(s, dict) and s.get("chapter_id") == cid])
            text_parts = [
                chapter.get("summary", ""),
                chapter.get("chapter_purpose", ""),
                chapter.get("main_conflict", ""),
                chapter.get("emotional_beat", ""),
                chapter.get("twist_or_hook", ""),
                chapter.get("ending_cliffhanger", ""),
                chapter.get("custom_chapter_details", ""),
            ]
            narrative_text = " ".join(str(part) for part in text_parts if part)
            signal_count = sum(1 for part in text_parts if str(part).strip())
            recommended = 3
            if len(narrative_text) > 900 or signal_count >= 6:
                recommended = 5
            elif len(narrative_text) > 500 or signal_count >= 4:
                recommended = 4
            if any(chapter.get(k) for k in ("twist_or_hook", "ending_cliffhanger")):
                recommended = max(recommended, 4)
            recommended = max(1, min(recommended, 8))

            beats = ["opening situation", "central conflict or discovery", "exit hook"]
            if recommended >= 4:
                beats.insert(2, "emotional reaction or relationship pressure")
            if recommended >= 5:
                beats.insert(3, "visual set-piece or decisive choice")

            recommendations.append({
                "chapter_id": cid,
                "chapter_number": chapter.get("chapter_number", 0),
                "chapter_title": chapter.get("chapter_title", ""),
                "current_scene_count": current_scene_count,
                "recommended_scene_count": recommended,
                "reason": "Estimated from chapter summary density, conflict, emotional beat, twist, and cliffhanger fields.",
                "must_cover_beats": beats,
            })
        return {"scene_count_recommendations": recommendations}

    def _normalize_generated_aliases(self, *, page: str, target_fields: list[str], generated: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(generated)
        if page == "threads":
            aliases = {
                "main_plot_thread": "main",
                "character_arc_threads": "character_arcs",
                "relationship_threads": "relationships",
                "threat_threads": "threats",
                "power_threads": "powers",
            }
            for source, target in aliases.items():
                if source in normalized and target not in normalized:
                    normalized[target] = normalized[source]
        if page == "scenes":
            if "scenes_for_chapter" in target_fields:
                if isinstance(normalized.get("scenes"), list) and "scenes_for_chapter" not in normalized:
                    normalized["scenes_for_chapter"] = normalized["scenes"]
                if isinstance(normalized.get("scene_cards"), list) and "scenes_for_chapter" not in normalized:
                    normalized["scenes_for_chapter"] = normalized["scene_cards"]
            if "scene_count_recommendations" in target_fields:
                if isinstance(normalized.get("recommendations"), list) and "scene_count_recommendations" not in normalized:
                    normalized["scene_count_recommendations"] = normalized["recommendations"]
        if page == "court":
            if "suggested_answers" in normalized and "suggest_answers" not in normalized:
                normalized["suggest_answers"] = normalized["suggested_answers"]
            if "suggest_answers" in normalized and "suggested_answers" not in normalized:
                normalized["suggested_answers"] = normalized["suggest_answers"]
        return normalized

    def generate_fields(
        self,
        *,
        story_id: str,
        page: str,
        target_fields: list[str],
        partial_input: dict[str, Any],
        context: dict[str, Any],
        user_constraints: dict[str, Any] | None = None,
        generation_hints: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        workspace_id = f"ai_gen_{page}"
        now = datetime.now(timezone.utc).isoformat()
        run_id = f"llm_{uuid4().hex[:12]}"
        logger.info("[LLM GEN] run_id=%s story=%s page=%s fields=%s", run_id, story_id, page, target_fields)

        system_prompts: dict[str, str] = {
            "cast": (
                "You are the Manga Maker character profile generator. Generate character profile fields as JSON. "
                "Use the story context (world rules, factions, threats, plot outline) to create consistent, story-relevant character details. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field. "
                "For array fields use arrays. For text fields use strings. Do NOT fabricate character names not in context. "
                "SELECTION FIELDS — you MUST also choose values for these from the option lists in partial_input: "
                "status_role → status.selected from status_options, character_role_level.selected from role_options; "
                "appearance → selected_visual_style from visual_style_options; "
                "faction → selected (alignment type) from faction_alignment_options; "
                "backstory → selected_backstory_type from backstory_type_options, selected_mental_state from mental_state_options, selected_community_place from community_place_options; "
                "personality → selected_personality_types (array, pick 2-5) from personality_type_options; "
                "powers → selected_power_origin from power_origin_options, selected_power_type from power_type_options, selected_power_level from power_level_options; "
                "arc → selected_arc_type from arc_type_options. "
                "Only pick values that EXACTLY match strings in those lists."
            ),
            "side": (
                "You are the Manga Maker side character generator. Generate side character profile fields as JSON. "
                "Use the story context (world rules, factions, major characters, plot outline) to create consistent supporting-character details. "
                "Side characters exist to serve the story and the protagonist — not to overshadow them. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field. "
                "For array fields use arrays. For text fields use strings. Do NOT duplicate existing major character names. "
                "SELECTION FIELDS — you MUST also choose values that EXACTLY match the option lists in partial_input: "
                "status_role → status.selected from status_options, character_role_level.selected from role_options; "
                "appearance → selected_visual_style from visual_style_options; "
                "faction → selected (alignment type) from faction_alignment_options; "
                "backstory → selected_backstory_type from backstory_type_options, selected_mental_state from mental_state_options, selected_community_place from community_place_options; "
                "personality → selected_personality_types (array, pick 2-4) from personality_type_options; "
                "story_role → story_function from story_function_options, narrative_fate from narrative_fate_options. "
                "Only pick values that EXACTLY match strings in those lists."
            ),
            "board": (
                "You are the Manga Maker plot generator. Generate plot outline fields as JSON. "
                "Use the story context (world rules, factions, characters, threats) to create consistent plot details. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field. "
                "When generating chapters, each chapter MUST have a unique chapter_id like 'ch_001', 'ch_002' and sequential chapter_number. "
                "Generate chapters that naturally follow the previous chapter's events and the arc's story question."
            ),
            "scenes": (
                "You are the Manga Maker scene generator. Generate scene card fields as JSON. "
                "Use the story context (characters, locations, plot outline) to create consistent scene details. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field."
            ),
            "threads": (
                "You are the Manga Maker plot thread generator. Generate plot thread fields as JSON. "
                "Analyze the story context (characters, relationships, threats, plot) to create meaningful thread analysis. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field."
            ),
            "court": (
                "You are the Manga Maker consequence advisor. Suggest answers for consequence questions as JSON. "
                "Read the story context and consequence questions. For each question, suggest the most logical answer based on story continuity. "
                "Return JSON only with key 'suggested_answers': array of { question_id, suggested_selected, reasoning }."
            ),
            "world": (
                "You are the Manga Maker world builder. Generate world-building fields as JSON. "
                "Use the story context (idea, genre, story foundation) to create consistent world details. "
                "You MUST fill selections from the available_options lists provided in partial_input: "
                "- world_type: return { selected: one option exactly matching available_world_types }. "
                "- world_master_rules: return { selected: [array of rules exactly matching available_world_rules] }. "
                "- major_factions_and_ruling_sides: return { selected: [array of faction types exactly matching available_factions] }. "
                "- major_threats_and_minor_side_threats: return { major_threat: one option from available_threats, minor_side_threats: [array from available_minor_threats] }. "
                "Only pick values that exactly match strings in the provided lists. Choose 2-5 rules, 1-3 factions, and 1-2 minor threats that fit the story. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field. "
                "FACTION DETAILS RULE: if 'world_core_details' is in the requested target_fields, you MUST populate "
                "world_core_details.faction_details for EVERY faction name in partial_input.major_factions_and_ruling_sides.selected. "
                "Key each entry by the faction slug (lowercase, spaces→underscores, strip special chars). "
                "Fill ALL 6 sub-fields: main_ruling_side, opposing_side, neutral_side, hidden_side, ruling_side_details, conflict_map. "
                "Never return an empty world_core_details — always include faction_details, threat_details, and any active rule_details."
            ),
            "locations": (
                "You are the Manga Maker location designer. Generate location data as JSON. "
                "Use the FULL story context — world rules, factions, threats, character homes/workplaces, AND every chapter's setting — to create visually distinct, story-consistent locations. "
                "Each location must have a clear visual identity: distinct structure, materials, props, and light-vs-shadow character a manga artist could draw from (the project renders black and white, so think in light/dark, not colour). "
                "positive_prompt MUST be SHORT — a comma-separated list of what is drawn (scene type, architecture/nature, key props, light-vs-shadow words like 'deep shadows'/'high contrast'). No colour names (black and white), no lighting/mood directives, no 'cinematic'/'atmospheric', no style word. "
                "When generating a list (target_field='locations'), base each location on actual chapters and story places — not generic fantasy defaults. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field."
            ),
            "faction_visuals": (
                "You are the Manga Maker faction visual designer. Generate faction visual signature data as JSON. "
                "Use the full story context (factions, world rules, threats, AND characters) — especially the appearance, clothing, and faction alignment of characters who belong to each faction. "
                "Their outfits, insignia, and visual motifs should inform the faction's visual signature. "
                "Return JSON only: keys matching the requested target_fields. "
                "Each faction signature must include visual_signature (prose description of the faction's look for the artist), positive_prompt (SHORT comma-separated list of drawn uniform/gear details — fabric, cut, insignia, accessories; no colour names, no lighting/mood, no style word; " + STYLE_INSTRUCTION + "), and negative_prompt. "
                "CRITICAL: For each target field, fill EVERY sub-field. Do not omit any sub-field."
            ),
            "character_visuals": (
                "You are the Manga Maker character visual designer. Generate character appearance and AI prompt data as JSON. "
                "Use the full story context (world style, faction, character backstory, personality, arc) to design visually expressive manga characters. "
                "Return JSON only: keys matching the requested target_fields. "
                "ai_image_prompt_notes must be a SHORT comma-separated list of the VISIBLE PERSON ONLY — build/age, face shape, hair, eyes, signature outfit, iconic prop. No scene, no pose, no background, no lighting, no colour names, no 'cinematic'/'noir', no style word. " + STYLE_INSTRUCTION + " "
                "negative_prompt_notes must list what to avoid (short). Do NOT fabricate character names not in context. "
                "CRITICAL: For each target field, fill EVERY sub-field. Do not omit any sub-field."
            ),
            "seed": (
                "You are the Manga Maker story idea generator. Generate story seed fields as JSON. "
                "You MUST fill selections from the available_options lists provided in partial_input: "
                "- story_type: return { selected: [array of 1-3 genre types exactly matching available_story_types] }. "
                "- ending_direction: return { selected: one option exactly matching available_endings }. "
                "- story_foundation: return { selected: one option exactly matching available_foundations }. "
                "Only pick values that exactly match strings in the provided lists. "
                "Return JSON only: keys matching the requested target_fields. "
                "CRITICAL: For each target field, fill EVERY sub-field listed in the Expected field schemas below. Do not omit any sub-field."
            ),
            "script": (
                "You are the Manga Maker visual director. Generate manga panel visual description fields as JSON. "
                "Return JSON only: keys matching the requested target_fields. "
                "Fields you may be asked to fill: "
                "  visual — 1-2 sentence manga panel description (shot composition, what the reader sees). "
                "  character_action — what characters are physically doing in the panel. "
                "  background_details — specific background elements, architecture, nature, props. "
                "  facial_expression — detailed expression for the focal character. "
                "  pose_or_body_language — body language, stance, gesture. "
                "  mood — single evocative word or short phrase (e.g. 'tense dread', 'quiet resolve'). "
                "  narration — optional caption text the reader sees in the panel (leave empty string if none fits). "
                "  location_id — MUST be one of the exact location_id strings from the available_locations list "
                "    provided in generation_hints. Do NOT invent a new id. Pick the location that best fits the "
                "    scene. If no location fits, return the first available id. "
                "  render_mode — one of: 't2i', 'i2i', 'layered'. Use 'i2i' for panels that continue a scene "
                "    with the same characters/background as the previous panel; 't2i' for new scenes. "
                "All text fields must be plain strings — never wrap them in {selected, options} objects. "
                "Never return null, {}, or an empty string for a requested field."
            ),
        }
        system = (
            system_prompts.get(page, system_prompts["seed"])
            + " Never return {}, null, an empty array for a requested field, or prose instead of JSON. "
            + "If a field is requested, return that field with usable story-specific content."
        )
        field_list = ", ".join(target_fields) if target_fields else "all fields"

        # ---- Build next-chapter instruction when chapters are targeted ----
        chapter_context_msg = ""
        if page == "board" and "chapters" in target_fields:
            plot_data = context.get("plot_outline", {})
            existing_chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", [])
            arc_data = plot_data.get("story_arc_overview", {})
            structure_type = (plot_data.get("narrative_structure", {}) or {}).get("selected", "")
            arc_title = arc_data.get("arc_title", "Untitled Arc")
            arc_summary = arc_data.get("arc_summary", "")
            arc_question = arc_data.get("main_story_question", "")
            ch_count = len(existing_chapters)
            next_num = ch_count + 1
            next_id = f"ch_{next_num:03d}"

            chapter_context_msg = (
                f"\n\n=== CHAPTER GENERATION INSTRUCTIONS ===\n"
                f"You are generating the NEXT chapter. This is chapter #{next_num} (chapter_id: {next_id}).\n"
                f"It belongs to arc: \"{arc_title}\".\n"
            )
            if arc_summary:
                chapter_context_msg += f"Arc summary: {arc_summary}\n"
            if arc_question:
                chapter_context_msg += f"Arc story question: {arc_question}\n"

            if existing_chapters:
                last_ch = existing_chapters[-1]
                chapter_context_msg += (
                    f"There are currently {ch_count} chapters.\n"
                    f"Previous chapter (#{ch_count}): \"{last_ch.get('chapter_title', 'Unknown')}\".\n"
                )
                if last_ch.get("summary"):
                    chapter_context_msg += f"Previous chapter summary: {last_ch.get('summary')}\n"
                if last_ch.get("ending_cliffhanger"):
                    chapter_context_msg += f"Previous chapter ended with: {last_ch.get('ending_cliffhanger')}\n"
                chapter_context_msg += f"Your chapter must naturally continue from where the previous chapter left off.\n"
            else:
                chapter_context_msg += f"This is the FIRST chapter. It must introduce the arc, setting, tone, and main characters.\n"

            # Add generation_hints from frontend
            hints = generation_hints or {}
            if hints.get("chapter_number"):
                chapter_context_msg += f"Requested chapter number: {hints['chapter_number']}\n"
            if hints.get("chapter_id"):
                chapter_context_msg += f"Requested chapter ID: {hints['chapter_id']}\n"
            if hints.get("chapter_title_hint"):
                chapter_context_msg += f"Title hint from user: {hints['chapter_title_hint']}\n"
            if hints.get("arc_title"):
                chapter_context_msg += f"Requested arc: {hints['arc_title']}\n"
            if hints.get("arc_length_type"):
                chapter_context_msg += f"Selected arc length: {hints['arc_length_type']}\n"
            if hints.get("arc_length_guidance"):
                chapter_context_msg += f"Arc length pacing guidance: {hints['arc_length_guidance']}\n"
            if hints.get("target_chapter_label"):
                chapter_context_msg += (
                    f"Planned arc size: {hints['target_chapter_label']} "
                    f"(min {hints.get('target_chapter_min')}, ideal {hints.get('target_chapter_ideal')}, max {hints.get('target_chapter_max')}).\n"
                )
            if hints.get("structure_type"):
                chapter_context_msg += f"Selected narrative structure: {hints['structure_type']}\n"
            if hints.get("structure_beats"):
                chapter_context_msg += f"Required structure beat order: {json.dumps(hints['structure_beats'], ensure_ascii=False)}\n"
            if hints.get("preferred_next_structure_section"):
                chapter_context_msg += f"Preferred next structure_section: {hints['preferred_next_structure_section']}\n"
            target_ideal = hints.get("target_chapter_ideal")
            target_max = hints.get("target_chapter_max")
            if isinstance(target_ideal, int) and next_num >= target_ideal:
                chapter_context_msg += "Because this chapter is at or beyond the ideal arc length, steer toward reveal, payoff, resolution, or a clean transition instead of opening a new sub-arc.\n"
            if isinstance(target_max, int) and next_num > target_max:
                chapter_context_msg += "This chapter is beyond the planned maximum. Only generate it as an intentional extension, and make it resolve or bridge rather than prolong the current arc.\n"
            if structure_type == "Mystery Arc":
                chapter_context_msg += (
                    "This arc uses Mystery Arc structure. The chapter structure_section MUST be one of: "
                    "mystery_setup, clue_investigation, escalation_pressure, major_reveal, confrontation_payoff. "
                    "Do not use act_1_setup/act_2_escalation/act_3_climax_resolution for Mystery Arc chapters.\n"
                )
            # List ALL existing chapters so LLM knows what's already done
            if existing_chapters:
                chapter_context_msg += "\nExisting chapters (do NOT recreate any of these):\n"
                for ch in existing_chapters:
                    chapter_context_msg += f"  - ch_{ch.get('chapter_number',0):03d} \"{ch.get('chapter_title','?')}\" -> {ch.get('summary','')[:80]}\n"
            chapter_context_msg += (
                f"Generate exactly ONE chapter object with ALL sub-fields filled. "
                f"MUST use chapter_id=\"{next_id}\" and chapter_number={next_num}. "
                f"Do NOT reuse any existing chapter_id. Do NOT return an empty chapters array.\n"
            )

        # ---- Build arc overview generation instructions when arc_overview is targeted ----
        arc_context_msg = ""
        if page == "board" and "arc_overview" in target_fields:
            plot_data = context.get("plot_outline", {})
            arc_data = plot_data.get("story_arc_overview", {})
            hints = generation_hints or {}
            existing_arc_title = arc_data.get("arc_title", "")
            existing_arc_number = arc_data.get("arc_number")
            existing_arc_summary = arc_data.get("arc_summary", "")
            chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", [])

            arc_context_msg = "\n\n=== ARC OVERVIEW GENERATION INSTRUCTIONS ===\n"
            if existing_arc_title and existing_arc_summary:
                arc_context_msg += f"You are EDITING / REPLACING an existing arc: \"{existing_arc_title}\""
                if existing_arc_number:
                    arc_context_msg += f" (Arc #{existing_arc_number})"
                arc_context_msg += (
                    f".\nCurrent arc summary: {existing_arc_summary[:300]}\n"
                    f"Current external conflict: {arc_data.get('main_external_conflict', 'not set')}\n"
                    f"Current internal conflict: {arc_data.get('main_internal_conflict', 'not set')}\n"
                    f"Current story question: {arc_data.get('main_story_question', 'not set')}\n"
                )
                if chapters:
                    arc_context_msg += f"Chapters in this arc: {len(chapters)}. "
                    arc_context_msg += f"Chapter range: Ch.{chapters[0].get('chapter_number', 1)} - Ch.{chapters[-1].get('chapter_number', len(chapters))}\n"
                    arc_context_msg += "Improve existing arc fields while maintaining chapter continuity.\n"
            else:
                arc_context_msg += "You are generating a NEW arc overview for the FIRST time.\n"
                arc_context_msg += "This is Arc #1 — the opening arc that sets up the story world, characters, and central conflict.\n"
                arc_context_msg += "Set arc_number=1. Create a compelling arc title that reflects the story's core theme.\n"
                arc_context_msg += "The arc summary should establish the status quo, introduce the main story question, and hint at the ending direction.\n"
            hints = generation_hints or {}
            if hints.get("arc_number"):
                arc_context_msg += f"Requested arc number: {hints['arc_number']}\n"
            if hints.get("arc_title"):
                arc_context_msg += f"Requested arc title: {hints['arc_title']}\n"
            if hints.get("arc_type"):
                arc_context_msg += f"Requested arc type: {hints['arc_type']}\n"
            if hints.get("arc_summary_hint"):
                arc_context_msg += f"Arc summary hint from user: {hints['arc_summary_hint']}\n"
            arc_context_msg += "Fill EVERY sub-field in the arc_overview schema. Do not omit any field.\n"

        # ---- Build scene generation / recommendation instructions when scene fields are targeted ----
        scene_context_msg = ""
        if page == "scenes" and ("scenes_for_chapter" in target_fields or "scene_count_recommendations" in target_fields):
            plot_data = context.get("plot_outline", {})
            all_chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", [])
            all_scenes = plot_data.get("scene_cards", {}).get("scenes", [])
            hints = generation_hints or {}
            target_chapter_ids = hints.get("chapter_ids", []) or partial_input.get("selected_chapter_ids", [])
            chapter_id_map = {ch.get("chapter_id"): ch for ch in all_chapters}
            if not target_chapter_ids and chapter_id_map:
                target_chapter_ids = [list(chapter_id_map.keys())[0]]
            target_chapters_detail = []
            for cid in target_chapter_ids:
                ch = chapter_id_map.get(cid)
                if ch:
                    ch_scenes = [s for s in all_scenes if isinstance(s, dict) and s.get("chapter_id") == cid]
                    scene_count = len(ch_scenes)
                    target_chapters_detail.append({
                        "chapter_id": ch.get("chapter_id", cid),
                        "title": ch.get("chapter_title", ""),
                        "summary": ch.get("summary", ""),
                        "characters_present": ch.get("characters_present", []),
                        "ending_cliffhanger": ch.get("ending_cliffhanger", ""),
                        "main_conflict": ch.get("main_conflict", ""),
                        "current_scene_count": scene_count,
                        "next_scene_order": scene_count + 1,
                    })
            if target_chapters_detail:
                scene_context_msg = "\n\n=== SCENE CHAPTER CONTEXT ===\n"
                for tc in target_chapters_detail:
                    scene_context_msg += (
                        f"\nChapter: \"{tc['title']}\" (ID: {tc['chapter_id']})\n"
                        f"Current scenes: {tc['current_scene_count']}. Next scene_order: {tc['next_scene_order']}.\n"
                    )
                    if tc.get("summary"):
                        scene_context_msg += f"Chapter summary: {tc['summary']}\n"
                    if tc.get("characters_present"):
                        scene_context_msg += f"Characters present: {', '.join(tc['characters_present'])}\n"
                    if tc.get("ending_cliffhanger"):
                        scene_context_msg += f"Ending cliffhanger: {tc['ending_cliffhanger']}\n"
                if "scene_count_recommendations" in target_fields:
                    scene_context_msg += (
                        "\nRecommend how many total scene cards each selected chapter needs before manga script generation.\n"
                        "Return JSON with exactly this top-level key: scene_count_recommendations.\n"
                        "Each recommendation MUST include chapter_id, chapter_number, chapter_title, current_scene_count, "
                        "recommended_scene_count, reason, and must_cover_beats.\n"
                        "recommended_scene_count is the total target for the chapter, not just additional scenes. Use 1-8. "
                        "Base the count on chapter complexity, number of plot turns, emotional beats, investigation/action density, and cliffhanger needs.\n"
                        "This is READ-ONLY planning. Do NOT generate scene card objects. Do NOT return scenes_for_chapter.\n"
                    )
                if "scenes_for_chapter" in target_fields:
                    scenes_per_chapter = int(hints.get("scenes_per_chapter") or 3)
                    scenes_per_chapter = max(1, min(scenes_per_chapter, 6))
                    scene_context_msg += (
                        f"\nGenerate exactly {scenes_per_chapter} new scenes per target chapter unless existing scenes already cover the chapter.\n"
                        "Return JSON with exactly this top-level key: scenes_for_chapter.\n"
                        "Each scene MUST include chapter_id, scene_order, location, time, characters_present, scene_goal, scene_conflict, "
                        "relationship_dynamic_used, new_information_revealed, action_or_dialogue_focus, visual_manga_moment, panel_mood, ending_beat, custom_scene_details.\n"
                        "Use the provided chapter_id exactly. Continue scene_order after existing scenes. Leave scene_id empty; the backend assigns canonical IDs.\n"
                        "Do NOT return {}, do NOT return an empty scenes_for_chapter array, and do NOT create scenes for unselected chapters.\n"
                    )
            elif not target_chapter_ids:
                scene_context_msg = "\n\n=== SCENE GENERATION ===\nWARNING: No target chapter specified. Use available chapters if recommendations are requested; otherwise use scene_order starting at 1.\n"

        # ---- Build thread generation instructions when threads are targeted ----
        thread_context_msg = ""
        if page == "threads":
            # Extract curated entity lists from context
            char_data = context.get("characters", {})
            ms_data = context.get("master_story", {})
            plot_data = context.get("plot_outline", {})
            curated_chars = []
            for p in char_data.get("created_major_character_profiles", []):
                curated_chars.append({
                    "character_id": p.get("profile_id", ""),
                    "name": p.get("character_name", ""),
                    "role": p.get("character_role_level", {}).get("selected", "") if isinstance(p.get("character_role_level"), dict) else "",
                })
            curated_rels = []
            for r in char_data.get("character_relationship_map", {}).get("relationships", []):
                pair = r.get("characters_involved", "")
                curated_rels.append({
                    "relationship_id": r.get("relationship_id") or stable_rel_id_from_pair(pair),
                    "characters_involved": pair,
                    "type": r.get("relationship_change_type", ""),
                })
            curated_threats = []
            threats_block = ms_data.get("major_threats_and_minor_side_threats", {})
            if threats_block.get("major_threat"):
                curated_threats.append({"name": threats_block["major_threat"], "type": "major"})
            for t in threats_block.get("minor_side_threats", []):
                curated_threats.append({"name": t, "type": "minor"})
            curated_powers = [{
                "character_id": p.get("profile_id", ""),
                "name": p.get("character_name", ""),
                "power": p.get("powers_and_abilities", {}).get("power_details", {}).get("power_name", "") if isinstance(p.get("powers_and_abilities"), dict) else "",
            } for p in char_data.get("created_major_character_profiles", [])]
            existing_threads = plot_data.get("plot_threads", {})
            existing_main = existing_threads.get("main_plot_thread", {})
            existing_char_arcs = existing_threads.get("character_arc_threads", [])
            existing_rels_threads = existing_threads.get("relationship_threads", [])
            existing_threats_threads = existing_threads.get("threat_threads", [])
            existing_powers_threads = existing_threads.get("power_threads", [])
            thread_context_msg = "\n\n=== THREAD GENERATION INSTRUCTIONS ===\n"
            thread_context_msg += f"Available character IDs: {json.dumps(curated_chars, ensure_ascii=False)}\n"
            thread_context_msg += f"Available relationship IDs: {json.dumps(curated_rels, ensure_ascii=False)}\n"
            thread_context_msg += f"Available threats: {json.dumps(curated_threats, ensure_ascii=False)}\n"
            thread_context_msg += f"Available powers: {json.dumps(curated_powers, ensure_ascii=False)}\n"
            thread_context_msg += f"Existing character_arcs: {len(existing_char_arcs)}\n"
            thread_context_msg += f"Existing relationship threads: {len(existing_rels_threads)}\n"
            thread_context_msg += f"Existing threat threads: {len(existing_threats_threads)}\n"
            thread_context_msg += f"Existing power threads: {len(existing_powers_threads)}\n"
            thread_context_msg += "Use ONLY the character_ids, relationship_ids, and threat names listed above. Do NOT fabricate new IDs.\n"
            thread_context_msg += "Keep each array concise: 1-4 items unless the context clearly requires more.\n"

        # ---- Build location generation instructions ----
        location_context_msg = ""
        if page == "locations":
            ms_data = context.get("master_story", {})
            char_data = context.get("characters", {})
            plot_data = context.get("plot_outline", {})
            hints = generation_hints or {}

            existing_locs = []
            locs_block = plot_data.get("locations") or {}
            if isinstance(locs_block, dict):
                existing_locs = locs_block.get("locations", []) or []
            existing_loc_names = [l.get("name", "") for l in existing_locs if l.get("name")]

            chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", []) or []
            arc_title = (plot_data.get("story_arc_overview", {}) or {}).get("arc_title", "")
            arc_summary = (plot_data.get("story_arc_overview", {}) or {}).get("arc_summary", "")
            world_type = ms_data.get("world_type", {})
            if isinstance(world_type, dict):
                world_type = world_type.get("selected", "")
            factions_block = ms_data.get("major_factions_and_ruling_sides", {})
            factions = factions_block.get("selected", []) if isinstance(factions_block, dict) else []
            threats_block = ms_data.get("major_threats_and_minor_side_threats", {})
            major_threat = threats_block.get("major_threat", "") if isinstance(threats_block, dict) else ""

            major_profiles = char_data.get("created_major_character_profiles", [])
            char_info = [
                {
                    "name": p.get("character_name", ""),
                    "faction": clip_text((p.get("main_character_faction_alignment") or {}).get("alignment_details", {}).get("linked_master_faction", ""), 60) if isinstance(p.get("main_character_faction_alignment"), dict) else "",
                    "community": clip_text((p.get("character_backstory_mental_state_and_community_place") or {}).get("community_place_details", {}).get("community_name", ""), 60) if isinstance(p.get("character_backstory_mental_state_and_community_place"), dict) else "",
                }
                for p in major_profiles[:10]
            ]

            location_context_msg = "\n\n=== LOCATION GENERATION INSTRUCTIONS ===\n"
            location_context_msg += (
                f"You are generating locations for this story.\n"
                f"World type: {world_type}\n"
                f"Active factions: {factions}\n"
                f"Major threat: {major_threat}\n"
            )
            if arc_title:
                location_context_msg += f"Current arc: \"{arc_title}\"\n"
            if arc_summary:
                location_context_msg += f"Arc summary: {arc_summary[:300]}\n"

            if chapters:
                location_context_msg += f"\nChapters ({len(chapters)} total) — extract real story places from these:\n"
                for ch in chapters[:12]:
                    ch_info = f"  Ch.{ch.get('chapter_number', '?')}: \"{ch.get('chapter_title', '')}\""
                    if ch.get("summary"):
                        ch_info += f" — {ch['summary'][:120]}"
                    if ch.get("main_conflict"):
                        ch_info += f" | conflict: {ch['main_conflict'][:80]}"
                    location_context_msg += ch_info + "\n"
                location_context_msg += (
                    "Read the chapter summaries and conflicts. Identify the KEY PLACES where scenes happen "
                    "(e.g. where characters live, fight, work, meet, hide, or confront the main threat). "
                    "Generate locations for those actual story places — not generic fantasy settings.\n"
                )
            else:
                location_context_msg += (
                    "\nNo chapters exist yet. Generate locations based on the world type, factions, "
                    "major threat, and character community places — places a story in this setting WOULD need.\n"
                )

            if char_info:
                location_context_msg += f"\nKey characters (use their faction/community to infer their home/work locations):\n"
                for c in char_info:
                    line = f"  - {c['name']}"
                    if c.get("faction"):
                        line += f" (faction: {c['faction']})"
                    if c.get("community"):
                        line += f" (community: {c['community']})"
                    location_context_msg += line + "\n"

            if existing_loc_names:
                location_context_msg += f"\nAlready created locations (DO NOT duplicate): {existing_loc_names}\n"

            target_count = hints.get("count", 6)
            single_name = hints.get("name_hint", "")
            single_type = hints.get("type_hint", "")

            if "locations" in target_fields:
                location_context_msg += (
                    f"\nGenerate exactly {target_count} location objects as the 'locations' array. "
                    "Each must be a REAL story place inferred from the chapters, world, factions, and characters above. "
                    "Do NOT generate generic or placeholder locations. "
                    "Each location needs: name, type, description (rich visual prose for the artist), "
                    "positive_prompt (SHORT comma-separated list of drawn details — no colour, no lighting/mood directives, no style word), negative_prompt.\n"
                )
            else:
                # Single location fill
                if single_name:
                    location_context_msg += f"\nYou are filling fields for the location: \"{single_name}\""
                    if single_type:
                        location_context_msg += f" (type: {single_type})"
                    location_context_msg += (
                        "\nBase the description and prompts on this location's role in the story context above. "
                        "positive_prompt = a SHORT comma-separated list of drawn details (no colour, no lighting/mood directives, no style word).\n"
                    )
                else:
                    location_context_msg += "\nFill the requested fields for this location based on the story context above.\n"

        # ---- Build cast/side identity instructions ----
        identity_context_msg = ""
        # Skip single-profile framing when generating the full auto side cast array —
        # the dedicated auto_gen_context_msg block below provides correct instructions.
        if page in ("cast", "side") and not (page == "side" and "auto_side_cast" in target_fields):
            char_data = context.get("characters", {})
            ms_data = context.get("master_story", {})
            major_profiles = char_data.get("created_major_character_profiles", [])
            side_profiles = char_data.get("created_side_character_profiles", [])
            hints = generation_hints or {}
            existing_names = [p.get("character_name", "") for p in major_profiles if p.get("character_name")]
            side_names = [p.get("character_name", "") for p in side_profiles if p.get("character_name")]
            structure = ms_data.get("story_structure", {}).get("selected", "") if isinstance(ms_data.get("story_structure"), dict) else ""
            editing_existing = bool(hints.get("edit_existing"))
            current_profile_id = hints.get("profile_id") or partial_input.get("profile_id", "")
            current_character_name = hints.get("character_name") or partial_input.get("character_name", "")
            identity_context_msg = "\n\n=== CHARACTER GENERATION INSTRUCTIONS ===\n"
            if editing_existing:
                role = "MAJOR" if page == "cast" else "SIDE"
                identity_context_msg += f"You are filling an EXISTING {role} character profile, not creating a new character.\n"
                identity_context_msg += f"Target profile_id: {current_profile_id or 'unknown'}\n"
                identity_context_msg += f"Target character_name: {current_character_name or 'unnamed'}\n"
                identity_context_msg += "Keep this exact character identity. Do NOT rename them, replace them, duplicate them, or invent a different protagonist.\n"
                identity_context_msg += "Use the existing partial_input fields as canon. Fill empty or weak fields so they fit the current story, world rules, factions, threats, plot outline, and relationships.\n"
                identity_context_msg += "If a requested tab already has user-filled details, refine around those details instead of contradicting them.\n"
                if page == "side":
                    identity_context_msg += f"Major characters for context only: {', '.join(existing_names)}\n"
            elif page == "cast":
                identity_context_msg += f"You are generating a MAJOR character profile.\n"
                identity_context_msg += f"Existing major characters ({len(major_profiles)}): {', '.join(existing_names)}\n"
                identity_context_msg += f"Story structure: {structure}\n"
                identity_context_msg += "Do NOT duplicate existing character names. Create a distinct character.\n"
            else:
                identity_context_msg += f"You are generating a SIDE character profile.\n"
                identity_context_msg += f"Existing side characters ({len(side_profiles)}): {', '.join(side_names)}\n"
                identity_context_msg += f"Major characters (reference, do not duplicate): {', '.join(existing_names)}\n"
                identity_context_msg += "Side characters should support the story and major characters.\n"
            if page == "side" and "story_role" in target_fields:
                major_names = ", ".join(existing_names) if existing_names else "none yet"
                identity_context_msg += (
                    f"\nFor story_role: the major characters are [{major_names}]. "
                    "Define how this side character specifically relates to them and what narrative purpose they serve. "
                    "relationship_to_protagonist should name the actual major character(s) and describe the bond (e.g. 'Father of Kinji, estranged for 10 years'). "
                    "story_impact should explain the concrete effect on the story (their death, revelation, betrayal, protection, etc.).\n"
                )
            user_notes = hints.get("user_character_notes", "").strip()
            if user_notes:
                identity_context_msg += f"\n=== USER NOTES FOR THIS CHARACTER ===\n{user_notes}\nTreat these notes as the user's creative intent. Align ALL generated fields with this description.\n"

        # ---- Build auto-generate side cast instructions ----
        auto_gen_context_msg = ""
        if page == "side" and "auto_side_cast" in target_fields:
            char_data = context.get("characters", {})
            major_profiles = char_data.get("created_major_character_profiles", [])
            side_profiles = char_data.get("created_side_character_profiles", [])
            existing_major = [p.get("character_name", "") for p in major_profiles if p.get("character_name")]
            existing_side = [p.get("character_name", "") for p in side_profiles if p.get("character_name")]
            auto_gen_context_msg = "\n\n=== AUTO SIDE CHARACTER GENERATION ===\n"
            auto_gen_context_msg += (
                "Analyze the full story context and identify every supporting character the story logically needs "
                "but that doesn't already exist. Sources to mine:\n"
                "  - Major character backstories (family, teachers, rivals, childhood friends explicitly mentioned)\n"
                "  - Faction structures (guards, commanders, priests, enforcers, recruiters)\n"
                "  - Chapter events (witnesses, informants, helpers, enemies in specific scenes)\n"
                "  - World rules and setting (roles that must exist given the genre: healers, merchants, elders, etc.)\n"
                "  - Threat organisations (lieutenants, minions, victims, resistors, informants)\n"
                "  - Plot threads (characters referenced but not yet profiled)\n"
            )
            if existing_major:
                auto_gen_context_msg += f"Existing MAJOR characters — DO NOT recreate any of these: {', '.join(existing_major)}\n"
            if existing_side:
                auto_gen_context_msg += f"Existing SIDE characters — DO NOT duplicate any of these: {', '.join(existing_side)}\n"
            auto_gen_context_msg += (
                "Generate as many profiles as the story clearly implies — no more, no fewer. "
                "Every profile must be story-specific and directly grounded in the context above. "
                "Do not invent characters that have no story basis.\n"
            )

        # ---- Build court optimization ----
        court_context_msg = ""
        if page == "court":
            ws = context.get("plot_workspace", {})
            questions = ws.get("consequence_questions", [])
            if questions:
                court_context_msg = "\n\n=== CONSEQUENCE QUESTIONS ===\n"
                court_context_msg += f"Answer these {len(questions)} questions:\n"
                court_context_msg += json.dumps(questions, ensure_ascii=False)
                court_context_msg += "\nSuggest the most logical answer for each based on story continuity.\n"

        # ---- Build panel-fill instructions when page is "script" ----
        script_context_msg = ""
        if page == "script":
            hints = generation_hints or {}
            avail_locs = hints.get("available_locations", [])
            ch_num = hints.get("chapter_number", "")
            ch_title = hints.get("chapter_title", "")
            pg_num = hints.get("page_number", "")
            pn_num = hints.get("panel_number", "")
            script_context_msg = "\n\n=== PANEL FILL INSTRUCTIONS ===\n"
            if ch_num or ch_title:
                script_context_msg += f"Chapter: {ch_num}{': ' + ch_title if ch_title else ''}\n"
            if pg_num:
                script_context_msg += f"Page: {pg_num}"
                if pn_num:
                    script_context_msg += f", Panel: {pn_num}"
                script_context_msg += "\n"
            if avail_locs:
                script_context_msg += "Available locations (use EXACTLY these location_id values):\n"
                for loc in avail_locs:
                    script_context_msg += (
                        f"  location_id={loc.get('location_id', '')} | "
                        f"name=\"{loc.get('name', '')}\" | type={loc.get('type', '')}\n"
                    )
                script_context_msg += (
                    "You MUST return location_id as one of the exact strings listed above. "
                    "Match the location to the scene context. Do not fabricate or omit it.\n"
                )
            else:
                script_context_msg += "No locations defined yet — omit location_id from your response.\n"
            script_context_msg += (
                "All other text fields (visual, character_action, etc.) must be plain strings. "
                "Do NOT wrap them in {selected, options} objects.\n"
            )

        constraints_msg = ""
        if user_constraints:
            constraints_msg = "\nUser constraints:\n"
            if user_constraints.get("user_intent_notes"):
                constraints_msg += f"  Intent: {user_constraints['user_intent_notes']}\n"
            if user_constraints.get("do_not_change_these_parts"):
                constraints_msg += f"  Do NOT change: {user_constraints['do_not_change_these_parts']}\n"
            if user_constraints.get("user_priority"):
                constraints_msg += f"  Priority: {user_constraints['user_priority']}\n"
        schema_hint = field_schema_hint(page, target_fields)
        compact_context = compact_generation_context(
            page=page,
            context=context,
            generation_hints=generation_hints,
        )
        user_msg = (
            f"Page: {page}\n"
            f"Fields to generate: [{field_list}]\n"
            f"Partial input already filled: {json.dumps(partial_input, ensure_ascii=False)}\n"
            f"{constraints_msg}"
            f"{arc_context_msg}{chapter_context_msg}{scene_context_msg}{thread_context_msg}{location_context_msg}{identity_context_msg}{auto_gen_context_msg}{court_context_msg}{script_context_msg}"
            f"Current compact story context: {json.dumps(compact_context, ensure_ascii=False)}"
            f"{schema_hint}"
        )
        logger.info("[LLM PROMPT] run_type=field_gen_%s compact_prompt_chars=%s", page, len(user_msg))

        fallback = {"generated_fields": {}, "warnings": ["Deterministic fallback — AI not configured."]}
        input_payload = {"task": "field_generation", "page": page, "target_fields": target_fields, "partial_input": partial_input}

        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=workspace_id,
            run_type=f"field_gen_{page}",
            input_payload=input_payload,
            system_prompt=system,
            user_prompt=user_msg,
            fallback=fallback,
        )
        out = result.output
        generated = out.get("generated_fields", out) if isinstance(out, dict) else {}
        warnings = out.get("warnings", [])
        if not isinstance(generated, dict):
            generated = {"_raw": str(generated)}
        generated = self._normalize_generated_aliases(page=page, target_fields=target_fields, generated=generated)
        if page == "scenes" and "scenes_for_chapter" in target_fields and not generated.get("scenes_for_chapter"):
            warnings = [*warnings, "AI returned no scene cards. Retry in a minute or fill manually."]
        if page == "scenes" and "scene_count_recommendations" in target_fields and not generated.get("scene_count_recommendations"):
            warnings = [*warnings, "AI returned no scene-count recommendations. Retry in a minute or fill manually."]
        if page == "threads":
            generated = backfill_thread_ids(generated=generated, context=context)
        return {"generated": generated, "generated_fields": generated, "warnings": warnings, "used_fallback": result.used_fallback}

    # ── Batch panel fill ──────────────────────────────────────────────────────

    def fill_chapter_panels_batch(
        self,
        *,
        story_id: str,
        chapter_metadata: dict[str, Any],
        pages: list[dict[str, Any]],
        available_locations: list[dict[str, Any]],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        """Fill ALL panel visual fields for a chapter in a single LLM call.

        Instead of one call per panel (N×M calls), the LLM receives every panel in
        the chapter at once and returns a mapping of panel_id → filled fields.
        Reduces ~15 sequential calls to 1 per chapter invocation.

        Returns: {"panels": {panel_id: {field: value, ...}, ...}, "warnings": [...], "used_fallback": bool}
        """
        run_id = f"llm_{uuid4().hex[:12]}"
        ch_num = chapter_metadata.get("chapter_number", "?")
        ch_title = chapter_metadata.get("chapter_title", "")
        logger.info("[LLM BATCH] run_id=%s story=%s chapter=%s", run_id, story_id, ch_num)

        # Build a flat list of panels with their page context so the LLM knows placement.
        panel_inventory: list[dict[str, Any]] = []
        for page in pages:
            pg_num = page.get("page_number", "?")
            pg_mood = page.get("page_mood", "")
            for panel in (page.get("panels") or []):
                if not isinstance(panel, dict):
                    continue
                entry: dict[str, Any] = {
                    "panel_id": panel.get("panel_id", ""),
                    "page_number": pg_num,
                    "panel_number": panel.get("panel_number", "?"),
                }
                if pg_mood:
                    entry["page_mood"] = pg_mood
                # Pass existing dialogue as context so the LLM can write consistent visuals.
                dialogue = panel.get("dialogue")
                if dialogue:
                    entry["dialogue_context"] = [
                        f"{(d.get('speaker_name') or d.get('speaker') or '?')}: {d.get('text', '')}"
                        for d in (dialogue if isinstance(dialogue, list) else [])
                        if isinstance(d, dict) and d.get("text")
                    ]
                panel_inventory.append(entry)

        if not panel_inventory:
            return {"panels": {}, "warnings": ["No panels found in chapter."], "used_fallback": False}

        # Location block for the prompt.
        loc_block = ""
        if available_locations:
            loc_block = "Available locations — use EXACTLY these location_id values:\n"
            for loc in available_locations:
                loc_block += f"  {loc.get('location_id', '')} | \"{loc.get('name', '')}\" | type={loc.get('type', '')}\n"
        else:
            loc_block = "No locations defined — omit location_id from your response.\n"

        system = (
            "You are the Manga Maker visual director. Fill ALL panel visual fields for this chapter in ONE response. "
            "Return a single JSON object with key \"panels\" whose value maps panel_id → filled fields object. "
            "Every panel_id in the input MUST appear in your output. "
            "Fields to fill for each panel:\n"
            "  visual — 1-2 sentence manga panel description (shot composition, what the reader sees).\n"
            "  character_action — what characters are physically doing.\n"
            "  background_details — specific background elements, architecture, nature, props.\n"
            "  facial_expression — detailed expression for the focal character.\n"
            "  pose_or_body_language — body language, stance, gesture.\n"
            "  mood — single evocative word or short phrase (e.g. 'tense dread', 'quiet resolve').\n"
            "  narration — optional caption text (empty string if none fits).\n"
            "  location_id — MUST be one of the exact location_id strings from available_locations. "
            "Pick the one that best fits the scene. Never invent an id.\n"
            "  render_mode — one of: 't2i', 'i2i', 'layered'. Use 'i2i' for panels that continue the "
            "same scene as the previous panel; 't2i' for new scenes.\n"
            "All text fields must be plain strings — never objects. Never omit a panel_id. "
            "Return JSON only — no markdown, no explanation."
        )

        compact_context = compact_generation_context(
            page="script",
            context=context,
            generation_hints={"chapter_number": ch_num, "chapter_title": ch_title},
        )

        user_msg = (
            f"Chapter: {ch_num}{': ' + ch_title if ch_title else ''}\n\n"
            f"{loc_block}\n"
            f"Panels to fill ({len(panel_inventory)} total):\n"
            f"{json.dumps(panel_inventory, ensure_ascii=False)}\n\n"
            f"Story context:\n{json.dumps(compact_context, ensure_ascii=False)}\n\n"
            'Return format: { "panels": { "<panel_id>": { "visual": "...", "character_action": "...", '
            '"background_details": "...", "facial_expression": "...", "pose_or_body_language": "...", '
            '"mood": "...", "narration": "...", "location_id": "...", "render_mode": "t2i" }, ... } }'
        )

        # Build deterministic fallback (one entry per panel).
        first_loc_id = available_locations[0]["location_id"] if available_locations else ""
        fallback_panels: dict[str, Any] = {
            entry["panel_id"]: {
                "visual": f"Ch.{ch_num} Pg.{entry['page_number']} Panel {entry['panel_number']} — scene in progress.",
                "character_action": "Characters engage in the scene.",
                "background_details": "Scene background.",
                "facial_expression": "Focused.",
                "pose_or_body_language": "Standard stance.",
                "mood": "Tense",
                "narration": "",
                "location_id": first_loc_id,
                "render_mode": "t2i",
            }
            for entry in panel_inventory
            if entry["panel_id"]
        }
        fallback = {"panels": fallback_panels, "warnings": ["Deterministic fallback — AI not configured."]}

        # Use 3× the normal timeout — batch calls generate far more tokens.
        batch_timeout = max(self.settings.llm_timeout_seconds * 3, 120.0)

        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=None,
            run_type="fill_chapter_panels_batch",
            input_payload={"chapter": ch_num, "panel_count": len(panel_inventory)},
            system_prompt=system,
            user_prompt=user_msg,
            fallback=fallback,
            timeout_override=batch_timeout,
        )
        out = result.output
        panels_map = out.get("panels", {})
        if not isinstance(panels_map, dict):
            panels_map = {}

        return {
            "panels": panels_map,
            "warnings": out.get("warnings", []),
            "used_fallback": result.used_fallback,
        }

    def analyze_relationships(self, *, story_id: str, chapter_ids: list[str] | None = None) -> dict[str, Any]:
        """Analyze story chapters and arcs to propose relationship map updates."""
        registry = self.registry
        context: dict = {}
        char_rec = registry.get_current_file(story_id, "characters")
        plot_rec = registry.get_current_file(story_id, "plot_outline")
        if char_rec:
            char_data = char_rec.get("json_copy", {})
            profiles = char_data.get("created_major_character_profiles", [])
            context["characters"] = [{
                "name": p.get("character_name", ""),
                "role": p.get("character_role_level", {}).get("selected", "") if isinstance(p.get("character_role_level"), dict) else p.get("character_role_level", ""),
                "faction": p.get("main_character_faction_alignment", {}).get("alignment_details", {}).get("linked_master_faction", ""),
                "personality": ", ".join(p.get("character_personality", {}).get("personality_details", {}).get("core_traits", []) if isinstance(p.get("character_personality"), dict) else [])[:200],
            } for p in profiles]
            existing_rels = []
            for r in char_data.get("character_relationship_map", {}).get("relationships", []):
                existing_rels.append({
                    "characters_involved": r.get("characters_involved", ""),
                    "relationship_change_type": r.get("relationship_change_type", ""),
                    "reason": r.get("reason", ""),
                })
            context["existing_relationships"] = existing_rels
        if plot_rec:
            plot_data = plot_rec.get("json_copy", {})
            arc = plot_data.get("story_arc_overview", {})
            context["arc"] = {
                "arc_title": arc.get("arc_title", ""),
                "arc_summary": arc.get("arc_summary", ""),
                "main_conflicts": f"external:{arc.get('main_external_conflict','')} internal:{arc.get('main_internal_conflict','')} relationship:{arc.get('main_relationship_conflict','')}",
                "relationships_used": arc.get("relationships_used", []),
            }
            all_chapters = plot_data.get("chapter_or_episode_list", {}).get("chapters", [])
            target_chapters = all_chapters
            if chapter_ids:
                target_chapters = [ch for ch in all_chapters if ch.get("chapter_id") in chapter_ids]
            context["chapters"] = [{
                "chapter_id": ch.get("chapter_id", ""),
                "arc_title": ch.get("arc_title", ""),
                "title": ch.get("chapter_title", ""),
                "summary": ch.get("summary", ""),
                "characters_present": ch.get("characters_present", []),
                "main_conflict": ch.get("main_conflict", ""),
                "emotional_beat": ch.get("emotional_beat", ""),
                "ending_cliffhanger": ch.get("ending_cliffhanger", ""),
            } for ch in target_chapters]
        system_prompt = (
            "You are the Manga Maker relationship analyst. "
            "Analyze the story context (characters, chapters, arc, existing relationships) and propose relationship map updates as JSON. "
            "For each character pair that interacts meaningfully in the chapters, create a relationship entry. "
            "Relationship change types: enemy, rival, friend, ally, family, mentor, love, secret, faction, neutral. "
            "characters_involved format: \"Character A/Character B\" (split by /). "
            "Provide a specific reason referencing the chapter events. "
            "NEVER include a relationship for a character with themselves. "
            "Return JSON: { \"proposed_relationships\": [{ \"characters_involved\": \"...\", \"relationship_change_type\": \"...\", \"reason\": \"...\", \"relationship_event_source\": \"chapter:ch_001\" }] }"
        )
        user_msg = (
            "Analyze these chapters and propose relationship map updates.\n"
            f"Chapters to analyze: {len(context.get('chapters', []))}\n"
            f"Story arc: {json.dumps(context.get('arc', {}), ensure_ascii=False)}\n"
            f"Characters: {json.dumps(context.get('characters', []), ensure_ascii=False)}\n"
            f"Chapters: {json.dumps(context.get('chapters', []), ensure_ascii=False)}\n"
            f"Existing relationships: {json.dumps(context.get('existing_relationships', []), ensure_ascii=False)}"
        )
        fallback = {"proposed_relationships": [], "warnings": ["Deterministic fallback — AI not configured."]}
        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=None,
            run_type="relationship_analysis",
            input_payload={"chapter_ids": chapter_ids, "arc": context.get("arc", {})},
            system_prompt=system_prompt,
            user_prompt=user_msg,
            fallback=fallback,
        )
        out = result.output
        proposed = out.get("proposed_relationships", []) if isinstance(out, dict) else []
        warnings = out.get("warnings", [])
        return {"proposed_relationships": proposed, "warnings": warnings}

    def check_arc_narrative_completion(
        self,
        *,
        story_id: str,
        arc_overview: dict[str, Any],
        arc_chapters: list[dict[str, Any]],
        structural: dict[str, Any],
    ) -> dict[str, Any]:
        """Layer 2 of the arc-completion check: ask the LLM whether the arc's
        narrative is actually told (not just whether all sections are tagged).

        Returns dict with: narrative_complete (bool|None), narrative_reason,
        missing_beats[], suggestion, confidence, llm_used.

        When the LLM is unavailable, narrative_complete is set to None so the
        caller can fall back to the structural verdict alone.
        """
        # Trim chapters to a compact payload — only the fields that matter for
        # narrative judgment. Keeps prompt cost low.
        compact_chapters = [
            {
                "chapter_id": c.get("chapter_id"),
                "chapter_number": c.get("chapter_number"),
                "chapter_title": c.get("chapter_title"),
                "structure_section": c.get("structure_section"),
                "summary": c.get("summary"),
                "main_conflict": c.get("main_conflict"),
                "emotional_beat": c.get("emotional_beat"),
                "twist_or_hook": c.get("twist_or_hook"),
                "ending_cliffhanger": c.get("ending_cliffhanger"),
            }
            for c in arc_chapters
        ]

        fallback = {
            "narrative_complete": None,
            "narrative_reason": "",
            "missing_beats": [],
            "suggestion": "new_arc" if structural.get("structural_complete") else "extend_arc",
            "confidence": None,
            "llm_used": False,
        }

        if not self.settings.llm_enabled:
            return fallback

        system_prompt = (
            "You judge whether a manga story arc is narratively complete. "
            "Given the arc's overview (goals, conflicts, ending target) and the chapters written so far, decide if the arc's main story question and conflicts have a satisfying payoff in those chapters. "
            "Be strict: a structurally tagged arc can still be narratively unfinished if a major beat (climax, payoff, resolution) is missing. "
            "Return JSON only with keys: narrative_complete (boolean), narrative_reason (1–2 sentences), missing_beats (array of short strings naming each missing beat), suggestion (\"new_arc\" if complete, \"extend_arc\" if not), confidence (number between 0 and 1)."
        )
        user_msg = json.dumps({
            "arc_overview": arc_overview,
            "structural_status": {
                "structure_type": structural.get("structure_type"),
                "sections_required": structural.get("sections_required_labels") or structural.get("sections_required"),
                "sections_covered": structural.get("sections_covered"),
                "sections_missing": structural.get("sections_missing"),
                "chapter_count": structural.get("chapter_count"),
                "structural_complete": structural.get("structural_complete"),
            },
            "chapters": compact_chapters,
        }, ensure_ascii=False)

        result = self._call_json_or_fallback(
            story_id=story_id,
            workspace_id=None,
            run_type="arc_completion_check",
            input_payload={"arc_title": arc_overview.get("arc_title", ""), "chapter_count": len(compact_chapters)},
            system_prompt=system_prompt,
            user_prompt=user_msg,
            fallback={"narrative_complete": None, "missing_beats": [], "narrative_reason": "", "suggestion": "extend_arc", "confidence": None},
        )
        out = result.output if isinstance(result.output, dict) else {}
        narrative_complete = out.get("narrative_complete")
        if not isinstance(narrative_complete, bool):
            narrative_complete = None
        return {
            "narrative_complete": narrative_complete,
            "narrative_reason": (out.get("narrative_reason") or "").strip(),
            "missing_beats": out.get("missing_beats") or [],
            "suggestion": out.get("suggestion") or ("new_arc" if narrative_complete else "extend_arc"),
            "confidence": out.get("confidence"),
            "llm_used": not result.used_fallback,
        }
