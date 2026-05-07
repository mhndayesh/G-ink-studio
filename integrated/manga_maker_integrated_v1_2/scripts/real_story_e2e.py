from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
import traceback
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any

import httpx


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "apps" / "api"
REPORT_PATH = ROOT / "real_story_e2e_report.json"


class E2EFailure(AssertionError):
    pass


class LiveApi:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=httpx.Timeout(240.0, connect=20.0))
        self.calls: list[dict[str, Any]] = []

    def close(self) -> None:
        self.client.close()

    def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any | None = None,
        params: dict[str, Any] | list[tuple[str, Any]] | None = None,
        expect: int | tuple[int, ...] = 200,
        envelope: bool = True,
    ) -> Any:
        expected = (expect,) if isinstance(expect, int) else expect
        url = f"{self.base_url}{path}"
        started = time.monotonic()
        response: httpx.Response | None = None
        for attempt in range(3):
            response = self.client.request(method, url, json=json_body, params=params)
            if response.status_code != 429:
                break
            time.sleep(61)
        elapsed_ms = int((time.monotonic() - started) * 1000)
        assert response is not None
        self.calls.append(
            {
                "method": method,
                "path": path,
                "status": response.status_code,
                "elapsed_ms": elapsed_ms,
            }
        )
        if response.status_code not in expected:
            raise E2EFailure(
                f"{method} {path} returned {response.status_code}, expected {expected}: {response.text[:2000]}"
            )
        if not envelope:
            return response
        try:
            data = response.json()
        except ValueError as exc:
            preview = response.text[:500] if response.text else f"{len(response.content)} raw bytes"
            raise E2EFailure(f"{method} {path} returned non-JSON response: {preview}") from exc
        if response.status_code >= 400:
            return data
        if not data.get("ok"):
            raise E2EFailure(f"{method} {path} returned ok=false: {data}")
        return data.get("data")

    def get(self, path: str, **kwargs: Any) -> Any:
        return self.request("GET", path, **kwargs)

    def post(self, path: str, **kwargs: Any) -> Any:
        return self.request("POST", path, **kwargs)

    def patch(self, path: str, **kwargs: Any) -> Any:
        return self.request("PATCH", path, **kwargs)

    def delete(self, path: str, **kwargs: Any) -> Any:
        return self.request("DELETE", path, **kwargs)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise E2EFailure(message)


def now_slug() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def patch_master(api: LiveApi, story_id: str, branch: str, value: Any, operation: str = "replace") -> Any:
    return api.patch(
        f"/stories/{story_id}/master-story/template",
        json_body={"target_branch": branch, "operation": operation, "value": value},
    )


def patch_plot(api: LiveApi, story_id: str, branch: str, value: Any, operation: str = "replace") -> Any:
    return api.patch(
        f"/stories/{story_id}/plot-outline/arc-overview",
        json_body={"target_branch": branch, "operation": operation, "value": value},
    )


def story_text() -> str:
    return (
        "Nara Vale and Jun Sable investigate the sealed Observatory Library after midnight. "
        "A mirror gate opens under the archive floor and a masked student spy attacks them. "
        "Jun is wounded protecting Nara, and the spy steals the Ashen Lens key. "
        "Nara hears the gate whisper her missing brother's name and chooses to hide that fact from Jun. "
        "The scene should become official memory only after the injury, betrayal, and trust consequences are reviewed."
    )


CHARACTER_PROFILES = {
    "char_001": {
        "name": "Nara Vale",
        "data": {
            "character_role_level": "Primary Main Character",
            "status": {"selected": "alive"},
            "core_identity": {
                "short_role": "Archive apprentice who can hear mirror gates.",
                "main_goal": "Find her missing brother without letting the academy erase the evidence.",
                "main_flaw": "Hides dangerous truths when scared of losing control.",
            },
            "appearance_and_visual_design": {
                "selected_visual_style": "School Uniform Style",
                "appearance_details": {
                    "age_range": "16",
                    "hair_color": "black with silver pin",
                    "eye_color": "amber",
                    "iconic_item": "cracked brass astrolabe",
                    "color_palette": ["ink black", "warm amber", "tarnished brass"],
                },
            },
        },
    },
    "char_002": {
        "name": "Jun Sable",
        "data": {
            "character_role_level": "Second Main Character",
            "status": {"selected": "alive"},
            "core_identity": {
                "short_role": "Disciplinary prefect assigned to protect forbidden archives.",
                "main_goal": "Expose the academy council's cover-up before another student disappears.",
                "main_flaw": "Treats suspicion as proof.",
            },
            "appearance_and_visual_design": {
                "selected_visual_style": "Cool / Stylish",
                "appearance_details": {
                    "age_range": "17",
                    "hair_color": "white-blond",
                    "eye_color": "blue-gray",
                    "iconic_item": "black prefect cord",
                    "color_palette": ["white", "slate", "cold blue"],
                },
            },
        },
    },
}


FIRST_ARC_CHAPTERS = [
    {
        "chapter_id": "ch_001",
        "chapter_number": 1,
        "arc_title": "Mirror Gate Arc",
        "chapter_title": "The Library Below Midnight",
        "chapter_purpose": "Open the mystery and bind Nara and Jun to the mirror gate case.",
        "structure_section": "Mystery Setup",
        "summary": "Nara and Jun break into the Observatory Library, discover the mirror gate, and survive a masked student's attack.",
        "characters_present": ["Nara Vale", "Jun Sable", "Mira Quill"],
        "relationships_used": ["Nara Vale / Jun Sable"],
        "factions_used": ["Schools / Academies", "Secret Organizations"],
        "threats_used": ["Portal / Gate Disaster", "Secret Organization Plot"],
        "world_rules_shown": ["Portals / Gates Exists", "Forbidden Knowledge Exists"],
        "power_system_shown": ["Mirror resonance"],
        "main_conflict": "The gate opens while a spy tries to steal the Ashen Lens.",
        "emotional_beat": "Nara lies to Jun about hearing her brother's voice.",
        "twist_or_hook": "The gate knows Nara's missing brother.",
        "ending_cliffhanger": "The Ashen Lens vanishes into a masked student's sleeve.",
        "custom_chapter_details": "Keep the tone tense, investigative, and visual.",
    },
    {
        "chapter_id": "ch_002",
        "chapter_number": 2,
        "arc_title": "Mirror Gate Arc",
        "chapter_title": "Clues In The Bell Tower",
        "chapter_purpose": "Follow evidence from the stolen lens to the academy bell tower.",
        "structure_section": "Clue Investigation",
        "summary": "Nara decodes ash marks while Jun tracks the spy's route through a sealed bell tower stair.",
        "characters_present": ["Nara Vale", "Jun Sable", "Mira Quill"],
        "relationships_used": ["Nara Vale / Jun Sable"],
        "factions_used": ["Schools / Academies", "Secret Organizations"],
        "threats_used": ["Secret Organization Plot"],
        "world_rules_shown": ["Forbidden Knowledge Exists"],
        "power_system_shown": ["Mirror resonance"],
        "main_conflict": "Each clue implicates a different student faction.",
        "emotional_beat": "Jun notices Nara hiding what she heard.",
        "twist_or_hook": "The bell tower shadow repeats Nara's brother's handwriting.",
        "ending_cliffhanger": "A bell rings though its clapper was removed years ago.",
        "custom_chapter_details": "Use investigation panels and suspicious glances.",
    },
    {
        "chapter_id": "ch_003",
        "chapter_number": 3,
        "arc_title": "Mirror Gate Arc",
        "chapter_title": "The Prefect's False Report",
        "chapter_purpose": "Escalate pressure by turning the academy against the investigation.",
        "structure_section": "Escalation / Pressure",
        "summary": "A forged report frames Jun as the intruder and forces Nara to choose whether to reveal the voice clue.",
        "characters_present": ["Nara Vale", "Jun Sable", "Mira Quill"],
        "relationships_used": ["Nara Vale / Jun Sable"],
        "factions_used": ["Schools / Academies", "Secret Organizations"],
        "threats_used": ["Secret Organization Plot", "Portal / Gate Disaster"],
        "world_rules_shown": ["Secret Organizations Exist"],
        "power_system_shown": ["Mirror resonance"],
        "main_conflict": "The council closes ranks and the spy leaks evidence against Jun.",
        "emotional_beat": "Nara's silence starts damaging Jun's trust.",
        "twist_or_hook": "The forged report is signed with Jun's private prefect seal.",
        "ending_cliffhanger": "Nara finds the real seal hidden in Mira's sketch case.",
        "custom_chapter_details": "Make suspicion and pressure visible in corridor scenes.",
    },
    {
        "chapter_id": "ch_004",
        "chapter_number": 4,
        "arc_title": "Mirror Gate Arc",
        "chapter_title": "Ashen Lens Confession",
        "chapter_purpose": "Reveal the spy motive and resolve the first gate crisis without solving the larger disappearance.",
        "structure_section": "Major Reveal Confrontation Payoff",
        "summary": "Mira admits she stole the Ashen Lens to keep the gate sealed, but the lens chooses Nara and opens anyway.",
        "characters_present": ["Nara Vale", "Jun Sable", "Mira Quill"],
        "relationships_used": ["Nara Vale / Jun Sable", "Nara Vale / Mira Quill"],
        "factions_used": ["Schools / Academies", "Secret Organizations"],
        "threats_used": ["Portal / Gate Disaster"],
        "world_rules_shown": ["Portals / Gates Exists", "Forbidden Knowledge Exists"],
        "power_system_shown": ["Mirror resonance"],
        "main_conflict": "Mira's betrayal becomes an emergency choice: seal the gate or listen to the missing brother.",
        "emotional_beat": "Nara confesses what she heard and accepts Jun's anger.",
        "twist_or_hook": "The missing brother speaks from inside the gate, not beyond it.",
        "ending_cliffhanger": "The sealed library reflects a second academy upside down.",
        "custom_chapter_details": "Resolve the theft, preserve the bigger mystery.",
    },
]


def scenes_for_chapter(chapter: dict[str, Any]) -> list[dict[str, Any]]:
    number = int(chapter["chapter_number"])
    return [
        {
            "scene_id": f"scene_{number:03d}_001",
            "chapter_id": chapter["chapter_id"],
            "scene_order": 1,
            "location": "Observatory Library" if number == 1 else "Academy North Wing",
            "time": "night",
            "characters_present": chapter["characters_present"],
            "scene_goal": f"Set up {chapter['chapter_title']} with a clear investigation beat.",
            "scene_conflict": chapter["main_conflict"],
            "relationship_dynamic_used": ", ".join(chapter["relationships_used"]),
            "new_information_revealed": chapter["twist_or_hook"],
            "action_or_dialogue_focus": "tense discovery and clipped manga dialogue",
            "visual_manga_moment": f"A full-page shadow image for {chapter['twist_or_hook']}",
            "panel_mood": "suspense",
            "ending_beat": "The clue points to the next room.",
            "custom_scene_details": "Use readable panel staging.",
        },
        {
            "scene_id": f"scene_{number:03d}_002",
            "chapter_id": chapter["chapter_id"],
            "scene_order": 2,
            "location": "Mirror Gate Chamber" if number in {1, 4} else "Sealed Corridor",
            "time": "late night",
            "characters_present": chapter["characters_present"],
            "scene_goal": f"Pay off the chapter conflict and end on {chapter['ending_cliffhanger']}",
            "scene_conflict": chapter["main_conflict"],
            "relationship_dynamic_used": ", ".join(chapter["relationships_used"]),
            "new_information_revealed": chapter["summary"],
            "action_or_dialogue_focus": "action beat into emotional reaction",
            "visual_manga_moment": f"Close-up hook: {chapter['ending_cliffhanger']}",
            "panel_mood": "urgent",
            "ending_beat": chapter["ending_cliffhanger"],
            "custom_scene_details": "End with a strong final panel.",
        },
    ]


SECOND_ARC_CHAPTER = {
    "chapter_id": "ch_005",
    "chapter_number": 5,
    "arc_title": "Ashen Oath Arc",
    "chapter_title": "The Upside-Down Academy",
    "chapter_purpose": "Start a new arc after the first export by entering the reflected academy.",
    "structure_section": "Mystery Setup",
    "summary": "Nara, Jun, and Mira step into the reflected academy and find students who remember erased timelines.",
    "characters_present": ["Nara Vale", "Jun Sable", "Mira Quill"],
    "relationships_used": ["Nara Vale / Jun Sable", "Nara Vale / Mira Quill"],
    "factions_used": ["Schools / Academies", "Secret Organizations"],
    "threats_used": ["Dimensional Collapse", "Secret Organization Plot"],
    "world_rules_shown": ["Multiple Realms Exists", "Portals / Gates Exists"],
    "power_system_shown": ["Mirror resonance"],
    "main_conflict": "The reflected academy demands one memory as entry price.",
    "emotional_beat": "Jun agrees to trust Nara but refuses to forgive the lie yet.",
    "twist_or_hook": "A second Jun is already enrolled in the reflected academy.",
    "ending_cliffhanger": "The second Jun calls Nara by her brother's secret nickname.",
    "custom_chapter_details": "This should prove the app can continue into a new arc.",
}


def setup_story(api: LiveApi) -> str:
    title = f"E2E Mirror Gate {now_slug()}"
    created = api.post("/stories", json_body={"title": title})
    story_id = created["story_id"]
    require(created["current_version_id"] == "v001", "new story should start at v001")
    require(api.get(f"/stories/{story_id}/status")["title"] == title, "created story title mismatch")
    files = api.get(f"/stories/{story_id}/files/current")
    require(files["files"]["plot_outline"] == "plot_outline.json", "plot outline filename must be canonical")
    return story_id


def fill_foundation(api: LiveApi, story_id: str) -> None:
    patch_master(api, story_id, "title", "Mirror Gate Academy")
    patch_master(api, story_id, "idea_so_far", story_text())
    patch_master(api, story_id, "story_type.selected", ["Mystery", "Supernatural", "School Life"])
    patch_master(api, story_id, "ending_direction.selected", "Open Ending")
    patch_master(api, story_id, "story_foundation.selected", "Mystery-Based")
    patch_master(api, story_id, "world_type.selected", "Academy Focused")
    patch_master(api, story_id, "world_master_rules.selected", ["Portals / Gates Exist", "Forbidden Knowledge Exists", "Secret Organizations Exist"])
    patch_master(api, story_id, "world_master_rules.rule_details.realm_dimension_rules", "Mirror gates connect sealed copies of academy spaces.")
    patch_master(api, story_id, "world_master_rules.rule_details.forbidden_rules", "A gate can answer a question only by taking a memory.")
    patch_master(api, story_id, "major_factions_and_ruling_sides.selected", ["Schools / Academies", "Secret Organizations", "Student Councils"])
    patch_master(api, story_id, "major_factions_and_ruling_sides.faction_details.faction_list", ["Observatory Academy", "Ashen Lens Society", "Prefect Council"])
    patch_master(api, story_id, "major_factions_and_ruling_sides.faction_details.conflict_map", "The academy hides gate incidents; the society steals keys; the prefects control evidence.")
    patch_master(api, story_id, "major_threats_and_minor_side_threats.major_threat", "Portal / Gate Disaster")
    patch_master(api, story_id, "major_threats_and_minor_side_threats.minor_side_threats", ["Secret Organization Plot", "Internal Betrayal"])
    patch_master(api, story_id, "major_threats_and_minor_side_threats.threat_details.main_threat_source", "The mirror gate below the Observatory Library.")
    patch_master(api, story_id, "major_threats_and_minor_side_threats.threat_details.main_threat_goal", "Trade student memories for access to erased timelines.")
    require(api.post(f"/stories/{story_id}/master-story/validate")["validation_status"] == "passed", "master validation failed")


def fill_characters(api: LiveApi, story_id: str) -> None:
    structure = api.patch(f"/stories/{story_id}/characters/structure", json_body={"selected": "Dual Main Characters"})
    require(len(structure["profiles_to_create"]) == 2, "dual structure should queue 2 profiles")
    for profile_id, profile in CHARACTER_PROFILES.items():
        api.post(
            f"/stories/{story_id}/characters/profiles",
            json_body={"profile_id": profile_id, "character_name": profile["name"], "profile_data": dict(profile["data"])},
        )
    api.post(
        f"/stories/{story_id}/characters/side-profiles",
        json_body={
            "character_name": "Mira Quill",
            "profile_data": {
                "status": {"selected": "alive"},
                "core_identity": {
                    "short_role": "Sketch-club witness and reluctant Ashen Lens courier.",
                    "main_goal": "Keep the gate sealed even if she has to betray Nara.",
                },
            },
        },
    )
    api.patch(
        f"/stories/{story_id}/characters/side-profiles/side_001",
        json_body={
            "character_name": "Mira Quill",
            "profile_data": {
                "appearance_and_visual_design": {
                    "selected_visual_style": "Mysterious / Hidden Face Style",
                    "appearance_details": {"iconic_item": "charcoal sketchbook"},
                }
            },
        },
    )
    api.patch(
        f"/stories/{story_id}/characters/profiles/char_002",
        json_body={
            "character_name": "Jun Sable",
            "profile_data": {"core_identity": {"secret": "Jun's prefect seal was copied before the story begins."}},
        },
    )
    conflict = api.get(f"/stories/{story_id}/characters/check-conflicts", params={"profile_id": "char_001", "new_name": "Nara Vale"})
    require(conflict["has_conflicts"] is False, "same-name conflict check should be clean")
    activated = api.post(f"/stories/{story_id}/characters/relationship-map/activate")
    require(activated["is_enabled"] is True, "relationship map should activate")
    applied = api.post(
        f"/stories/{story_id}/ai/apply-relationships",
        json_body={
            "relationships": [
                {
                    "relationship_id": "rel_001",
                    "characters_involved": "Nara Vale / Jun Sable",
                    "relationship_change_type": "uneasy allies",
                    "current_dynamic": "They need each other but distrust hidden motives.",
                },
                {
                    "relationship_id": "rel_002",
                    "characters_involved": "Nara Vale / Mira Quill",
                    "relationship_change_type": "betrayal tension",
                    "current_dynamic": "Mira protects Nara by lying to her.",
                },
            ]
        },
    )
    require(applied["added"] >= 2 and applied["total"] >= 2, "relationship updates should apply")
    web = api.get(f"/stories/{story_id}/graph/web")
    require(len(web["nodes"]) >= 3 and len(web["edges"]) >= 1, "relationship web should expose characters and edges")
    require(api.post(f"/stories/{story_id}/characters/validate")["validation_status"] == "passed", "characters validation failed")


def fill_arc(api: LiveApi, story_id: str, chapter_set: list[dict[str, Any]]) -> None:
    api.patch(
        f"/stories/{story_id}/plot-outline/story-start-workflow",
        json_body={"start_mode": "Plan First Arc Then Chapter 1", "current_stage": "fill_story_arc_overview"},
    )
    api.patch(f"/stories/{story_id}/plot-outline/narrative-structure", json_body={"selected": "Mystery Arc"})
    api.post(
        f"/stories/{story_id}/plot-outline/redo-arc-structure",
        json_body={
            "selected": "Mystery Arc",
            "custom_structure": "",
            "preserve_arc_overview": False,
            "clear_chapter_script": True,
            "confirmation": "RESET ARC",
        },
    )
    patch_plot(api, story_id, "arc_title", "Mirror Gate Arc")
    patch_plot(api, story_id, "arc_number", 1)
    patch_plot(api, story_id, "arc_type", "Opening mystery arc")
    patch_plot(api, story_id, "arc_length_type.selected", "Short Arc")
    patch_plot(api, story_id, "arc_summary", "Nara and Jun investigate a mirror gate, expose a stolen key, and open the larger reflected-academy mystery.")
    patch_plot(api, story_id, "starting_status_quo", "Observatory Academy hides old disappearances behind strict archive rules.")
    patch_plot(api, story_id, "main_story_question", "What is the mirror gate doing with erased students?")
    patch_plot(api, story_id, "central_emotional_question", "Can Nara trust Jun after hiding the gate's voice from him?")
    patch_plot(api, story_id, "main_external_conflict", "A spy steals the Ashen Lens while the gate destabilizes.")
    patch_plot(api, story_id, "main_internal_conflict", "Nara wants answers badly enough to lie.")
    patch_plot(api, story_id, "main_relationship_conflict", "Jun needs Nara's honesty, but his suspicion keeps pushing her away.")
    patch_plot(api, story_id, "main_threat_used", "Portal / Gate Disaster")
    patch_plot(api, story_id, "minor_threats_used", ["Secret Organization Plot", "Internal Betrayal"])
    patch_plot(api, story_id, "main_factions_used", ["Observatory Academy", "Ashen Lens Society", "Prefect Council"])
    patch_plot(api, story_id, "main_characters_used", ["Nara Vale", "Jun Sable", "Mira Quill"])
    patch_plot(api, story_id, "relationships_used", ["Nara Vale / Jun Sable", "Nara Vale / Mira Quill"])
    patch_plot(api, story_id, "ending_type_target", "Open Ending")
    patch_plot(
        api,
        story_id,
        "conflict_driven_outline.act_1_setup.opening_hook",
        "A mirror gate opens below the library during a stolen-key attack.",
    )
    patch_plot(
        api,
        story_id,
        "conflict_driven_outline.act_2_escalation.midpoint_reveal_or_defeat",
        "Jun is framed and Nara's silence becomes damaging evidence.",
    )
    patch_plot(
        api,
        story_id,
        "conflict_driven_outline.act_3_climax_resolution.climax_battle_or_confrontation",
        "Mira confesses, the Ashen Lens chooses Nara, and the gate opens to a reflected academy.",
    )
    patch_plot(
        api,
        story_id,
        "plot_threads",
        {
            "main_plot_thread": {
                "goal": "Find the Ashen Lens and learn why erased students speak through mirror gates.",
                "obstacles": ["academy cover-up", "spy theft", "memory price"],
                "turning_points": ["Jun is wounded", "Mira is exposed", "the gate answers Nara"],
                "resolution": "The first key theft is resolved, but the reflected academy opens.",
            },
            "character_arc_threads": [
                {
                    "character_id": "Nara Vale",
                    "starting_state": "hides dangerous truths",
                    "growth_beats": ["lies about the voice", "risks Jun's trust", "confesses before the gate opens"],
                    "lowest_point": "Jun realizes she withheld the key clue.",
                    "final_state": "chooses truth even when it costs trust.",
                }
            ],
            "relationship_threads": [
                {
                    "relationship_id": "rel_001",
                    "start_dynamic": "uneasy allies",
                    "change_beats": ["Jun protects Nara", "Nara hides a clue", "Nara confesses"],
                    "breaking_point": "Jun's forged report and Nara's silence collide.",
                    "final_dynamic": "not forgiven yet, but still working together.",
                }
            ],
            "threat_threads": [
                {
                    "threat_id_or_name": "Portal / Gate Disaster",
                    "first_hint": "mirror gate whispers from below the library",
                    "escalation_beats": ["lens stolen", "bell rings without clapper", "report forgery"],
                    "reveal": "the gate contains erased students and Nara's brother",
                    "final_outcome": "the gate opens into a second academy.",
                }
            ],
            "power_threads": [
                {
                    "character_id": "Nara Vale",
                    "power_name": "Mirror resonance",
                    "first_use": "hears the gate speak her brother's name",
                    "training_or_failure_beats": ["mistakes whispers for memory", "hides the clue"],
                    "breakthrough": "the Ashen Lens responds to her confession",
                    "cost_or_consequence": "the gate takes or exposes memories.",
                }
            ],
        },
    )
    for chapter in chapter_set:
        api.post(f"/stories/{story_id}/plot-outline/chapters", json_body=chapter)
        for scene in scenes_for_chapter(chapter):
            api.post(f"/stories/{story_id}/plot-outline/scenes", json_body=scene)
    temp_chapter = {
        "chapter_id": "ch_099",
        "chapter_number": 99,
        "arc_title": "Mirror Gate Arc",
        "chapter_title": "Temporary Delete Check",
        "chapter_purpose": "Temporary chapter used to exercise delete endpoints.",
        "summary": "Temporary",
        "main_conflict": "Temporary",
        "ending_cliffhanger": "Temporary",
    }
    api.post(f"/stories/{story_id}/plot-outline/chapters", json_body=temp_chapter)
    api.post(
        f"/stories/{story_id}/plot-outline/scenes",
        json_body={
            "scene_id": "scene_099_001",
            "chapter_id": "ch_099",
            "scene_order": 1,
            "location": "Temporary Room",
            "scene_goal": "Temporary delete check",
            "scene_conflict": "Temporary",
            "visual_manga_moment": "Temporary panel",
            "ending_beat": "Temporary end",
        },
    )
    api.delete(f"/stories/{story_id}/plot-outline/scenes/scene_099_001")
    deleted = api.delete(f"/stories/{story_id}/plot-outline/chapters/ch_099")
    require(deleted["integrity_lock"]["locked"] is False, "deleting final temp chapter should not lock story")
    lock = api.post(f"/stories/{story_id}/plot-outline/integrity-lock/advance", json_body={"chapter_number": 99})
    require(lock.get("already_unlocked") is True, "integrity advance should report already_unlocked")
    require(api.post(f"/stories/{story_id}/plot-outline/validate")["validation_status"] == "passed", "plot validation failed")


def writing_workspace_flow(api: LiveApi, story_id: str) -> None:
    api.get(f"/stories/{story_id}/plot-workspace")
    api.post(f"/stories/{story_id}/plot-workspace/validate")
    api.patch(
        f"/stories/{story_id}/plot-workspace/free-writing",
        json_body={
            "text": story_text(),
            "input_type": "Rough Idea",
            "user_priority": "Keep My Writing As Much As Possible",
            "user_intent_notes": "Use this for Chapter 1 consequence review.",
            "do_not_change_these_parts": ["Nara hears her brother's name.", "Jun is wounded protecting Nara."],
        },
    )
    ai = api.post(
        f"/stories/{story_id}/plot-workspace/ai-complete",
        json_body={"expansion_mode": "Light Expansion", "text": story_text()},
    )
    require(len(ai["expanded_text"]) >= len(story_text()), "AI completion should return expanded text")
    api.post(f"/stories/{story_id}/plot-workspace/ai-complete/decision", json_body={"decision": "Accept"})
    analysis = api.post(f"/stories/{story_id}/plot-workspace/analyze")
    require(len(analysis["detected_story_events"]) >= 1, "workspace analysis should detect at least one event")
    questions = api.get(f"/stories/{story_id}/plot-workspace/questions")
    for question in questions["questions"]:
        options = question.get("options") or []
        selected = options[0] if options else "Custom"
        api.post(
            f"/stories/{story_id}/plot-workspace/questions/{question['question_id']}/answer",
            json_body={"selected": selected, "custom_answer": "Keep this consequence but do not overwrite official JSON yet." if selected == "Custom" else ""},
        )
    confirmation = api.get(f"/stories/{story_id}/plot-workspace/confirmation")
    require(confirmation["status"] == "ready", "workspace confirmation should be ready after answering questions")
    approved = api.post(f"/stories/{story_id}/plot-workspace/approve", json_body={"decision": "Approve All"})
    require(approved["approved"] is True, "workspace approve should mark review approved")
    events = api.get(f"/stories/{story_id}/events")
    patches = api.get(f"/stories/{story_id}/patches")
    require(events["count"] == 0 and patches["count"] == 0, "dead event/patch tables should stay unused in current workflow")
    api.post(f"/stories/{story_id}/versions/create-from-approved-events", expect=400)


def generate_and_approve_script(api: LiveApi, story_id: str, chapter: dict[str, Any]) -> str:
    chapter_id = chapter["chapter_id"]
    status = api.get(f"/stories/{story_id}/chapter-script/chapters-status")
    require(any(c["chapter_id"] == chapter_id for c in status["chapters"]), f"{chapter_id} missing from script status")
    before = api.get(f"/stories/{story_id}/chapter-script", params={"chapter_id": chapter_id})
    require(before["source"] in {"current", "not_generated", "version_history"}, f"unexpected script source for {chapter_id}")
    generated = api.post(f"/stories/{story_id}/chapter-script/generate", params={"chapter_id": chapter_id})
    require(generated["pages_count"] >= 1, f"{chapter_id} script generation produced no pages")
    api.patch(
        f"/stories/{story_id}/chapter-script",
        json_body={
            "target_branch": "custom_chapter_script_details",
            "operation": "replace",
            "value": f"E2E review note for {chapter_id}: generated, patched, then approved.",
        },
    )
    api.post(f"/stories/{story_id}/chapter-script/validate")
    approved = api.post(f"/stories/{story_id}/chapter-script/approve", params={"chapter_id": chapter_id})
    require(approved.get("created_version_id"), f"{chapter_id} approval should create a version")
    require(approved.get("sync_results", {}).get("vector_sync", {}).get("created_chunks", 0) >= 1, "script approve should sync vector chunks")
    return approved["created_version_id"]


def generate_first_arc_scripts(api: LiveApi, story_id: str) -> list[str]:
    version_ids = []
    for chapter in FIRST_ARC_CHAPTERS:
        version_ids.append(generate_and_approve_script(api, story_id, chapter))
    statuses = api.get(f"/stories/{story_id}/chapter-script/chapters-status")
    generated = {c["chapter_id"]: c for c in statuses["chapters"]}
    for chapter in FIRST_ARC_CHAPTERS:
        info = generated[chapter["chapter_id"]]
        require(info["has_script"] is True and info["pages_count"] >= 1, f"{chapter['chapter_id']} should have generated script")
    historical = api.get(f"/stories/{story_id}/chapter-script", params={"chapter_id": "ch_001"})
    require(historical["source"] in {"version_history", "current"}, "historical chapter lookup should work")
    loaded = api.post(f"/stories/{story_id}/chapter-script/load", params={"chapter_id": "ch_001"})
    require(loaded.get("already_loaded") is True or loaded.get("pages_count", 0) >= 1, "load from history should load pages")
    version_ids.append(api.post(f"/stories/{story_id}/chapter-script/approve", params={"chapter_id": "ch_001"})["created_version_id"])
    return version_ids


def export_and_check(api: LiveApi, story_id: str, expected_titles: list[str]) -> dict[str, Any]:
    story_md = api.get(f"/stories/{story_id}/export/story", params={"fmt": "md"}, envelope=False)
    story_text_value = story_md.content.decode("utf-8")
    for title in expected_titles:
        require(title in story_text_value, f"story export missing {title}")
    scenes_md = api.get(f"/stories/{story_id}/export/scenes", params={"fmt": "md"}, envelope=False)
    scene_text_value = scenes_md.content.decode("utf-8")
    require("visual manga moment" in scene_text_value.lower() or "visual_manga_moment" in scene_text_value.lower(), "scene export missing visual moment field")
    visuals = api.get(f"/stories/{story_id}/export/visuals", params={"fmt": "md"}, envelope=False)
    visual_text_value = visuals.content.decode("utf-8")
    require("Nara Vale" in visual_text_value or "Mirror" in visual_text_value, "visual export should include story visual context")
    bundle = api.get(f"/stories/{story_id}/export/visuals-bundle", envelope=False)
    require(len(bundle.content) > 500, "visuals bundle should not be empty")
    raw_zip = api.get(f"/stories/{story_id}/export/raw-zip", envelope=False)
    require(len(raw_zip.content) > 1000, "raw zip should not be empty")
    with zipfile.ZipFile(BytesIO(raw_zip.content)) as zf:
        names = set(zf.namelist())
        require(any(name.endswith("master_story.json") for name in names), "raw zip missing master_story.json")
        require(any(name.endswith("plot_outline.json") for name in names), "raw zip missing plot_outline.json")
        require(any(name.endswith("chapter_script.json") for name in names), "raw zip missing chapter_script.json")
    return {
        "story_export_chars": len(story_text_value),
        "scene_export_chars": len(scene_text_value),
        "visual_export_chars": len(visual_text_value),
        "visual_bundle_bytes": len(bundle.content),
        "raw_zip_bytes": len(raw_zip.content),
    }


def start_second_arc(api: LiveApi, story_id: str) -> str:
    api.post(
        f"/stories/{story_id}/plot-outline/redo-arc-structure",
        json_body={
            "selected": "Mystery Arc",
            "custom_structure": "",
            "preserve_arc_overview": False,
            "clear_chapter_script": True,
            "confirmation": "RESET ARC",
        },
    )
    patch_plot(api, story_id, "arc_title", "Ashen Oath Arc")
    patch_plot(api, story_id, "arc_number", 2)
    patch_plot(api, story_id, "arc_type", "Second mystery arc")
    patch_plot(api, story_id, "arc_length_type.selected", "Short Arc")
    patch_plot(api, story_id, "arc_summary", SECOND_ARC_CHAPTER["summary"])
    patch_plot(api, story_id, "main_story_question", "What does the reflected academy remember?")
    patch_plot(api, story_id, "main_external_conflict", SECOND_ARC_CHAPTER["main_conflict"])
    patch_plot(api, story_id, "main_characters_used", SECOND_ARC_CHAPTER["characters_present"])
    patch_plot(api, story_id, "relationships_used", SECOND_ARC_CHAPTER["relationships_used"])
    patch_plot(
        api,
        story_id,
        "plot_threads",
        {
            "main_plot_thread": {
                "goal": "Survive the reflected academy and learn why it remembers erased students.",
                "obstacles": ["memory price", "second Jun", "gate instability"],
                "turning_points": ["entry memory is demanded", "second Jun appears"],
                "resolution": "",
            },
            "character_arc_threads": [],
            "relationship_threads": [],
            "threat_threads": [
                {
                    "threat_id_or_name": "Dimensional Collapse",
                    "first_hint": "the reflected academy has living doubles",
                    "escalation_beats": [],
                    "reveal": "",
                    "final_outcome": "",
                }
            ],
            "power_threads": [],
        },
    )
    api.post(f"/stories/{story_id}/plot-outline/chapters", json_body=SECOND_ARC_CHAPTER)
    for scene in scenes_for_chapter(SECOND_ARC_CHAPTER):
        scene["scene_id"] = scene["scene_id"].replace("005", "105")
        api.post(f"/stories/{story_id}/plot-outline/scenes", json_body=scene)
    return generate_and_approve_script(api, story_id, SECOND_ARC_CHAPTER)


def backend_audit(api: LiveApi, story_id: str, version_ids: list[str]) -> dict[str, Any]:
    status = api.get(f"/stories/{story_id}/status")
    versions = api.get(f"/stories/{story_id}/versions")
    require(versions["count"] >= 2, "version list should include approved script snapshots")
    current_version = status["current_version_id"]
    api.get(f"/stories/{story_id}/versions/{current_version}")
    api.get(f"/stories/{story_id}/versions/{current_version}/manifest")
    graph_status = api.get(f"/stories/{story_id}/graph/status")
    vector_status = api.get(f"/stories/{story_id}/vector/status")
    require(graph_status["can_connect"] is True, "graph status should be connected")
    require(vector_status["can_connect"] is True, "vector status should be connected")
    graph_projection = api.post(f"/stories/{story_id}/graph/project-events")
    graph_projections = api.get(f"/stories/{story_id}/graph/projections")
    vector_upsert = api.post(f"/stories/{story_id}/vector/upsert-current-memory")
    vector_chunks = api.get(f"/stories/{story_id}/vector/chunks")
    require(vector_chunks["count"] >= 1, "vector chunks should exist")
    continuity_current = api.post(f"/stories/{story_id}/continuity/check-current")
    continuity_version = api.post(f"/stories/{story_id}/continuity/check-version", json_body={"version_id": current_version})
    continuity_reports = api.get(f"/stories/{story_id}/continuity/reports")
    arc = api.get(f"/stories/{story_id}/ai/check-arc-completion")
    references = api.get(f"/stories/{story_id}/ai/references")
    require(len(references["characters"]) >= 2, "AI references should include characters")
    llm_runs = api.get("/llm/runs")
    llm_run_count = len(llm_runs) if isinstance(llm_runs, list) else int(llm_runs.get("count", 0))
    return {
        "status": status,
        "versions_count": versions["count"],
        "current_version": current_version,
        "approved_version_ids": version_ids,
        "graph_status": graph_status,
        "graph_projected_events": graph_projection["projected_events"],
        "graph_projection_count": graph_projections["count"],
        "vector_status": vector_status,
        "vector_upsert_chunks": vector_upsert["created_chunks"],
        "vector_chunk_count": vector_chunks["count"],
        "continuity_current_status": continuity_current["status"],
        "continuity_version_status": continuity_version["status"],
        "continuity_report_count": continuity_reports["count"],
        "arc_completion": arc,
        "llm_run_count": llm_run_count,
    }


def sqlite_audit(story_id: str) -> dict[str, Any]:
    db_path = API_ROOT / "storage" / "manga_registry.sqlite"
    require(db_path.exists(), f"SQLite registry not found: {db_path}")
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        tables = [
            "stories",
            "story_versions",
            "story_files",
            "story_events",
            "json_patches",
            "continuity_reports",
            "event_projections",
            "llm_runs",
            "vector_chunks",
        ]
        counts = {}
        for table in tables:
            counts[table] = conn.execute(f"SELECT COUNT(*) AS c FROM {table} WHERE story_id = ?", (story_id,)).fetchone()["c"]
        story = conn.execute("SELECT * FROM stories WHERE story_id = ?", (story_id,)).fetchone()
        require(story is not None, "story missing from SQLite")
        files = conn.execute(
            "SELECT file_type, official_filename, storage_path FROM story_files WHERE story_id = ? AND version_id = ?",
            (story_id, story["current_version_id"]),
        ).fetchall()
        filenames = {row["file_type"]: row["official_filename"] for row in files}
        require(filenames.get("plot_outline") == "plot_outline.json", "SQLite file record uses wrong plot outline name")
        return {
            "db_path": str(db_path),
            "counts": counts,
            "current_version_id": story["current_version_id"],
            "current_files": filenames,
        }


def neo4j_audit(story_id: str) -> dict[str, Any]:
    try:
        from neo4j import GraphDatabase
    except Exception as exc:
        return {"available": False, "error": f"neo4j driver unavailable: {exc}"}
    uri = os.getenv("MANGA_NEO4J_URI", "bolt://localhost:7687")
    user = os.getenv("MANGA_NEO4J_USER", "neo4j")
    password = os.getenv("MANGA_NEO4J_PASSWORD", "manga_maker_password")
    database = os.getenv("MANGA_NEO4J_DATABASE", "neo4j")
    try:
        with GraphDatabase.driver(uri, auth=(user, password), connection_timeout=10) as driver:
            driver.verify_connectivity()
            with driver.session(database=database) as session:
                node_count = session.run(
                    "MATCH (n) WHERE n.story_id = $story_id OR n.id = $story_id RETURN count(n) AS c",
                    story_id=story_id,
                ).single()["c"]
                rel_count = session.run(
                    "MATCH ()-[r]->() WHERE r.story_id = $story_id RETURN count(r) AS c",
                    story_id=story_id,
                ).single()["c"]
        return {"available": True, "connected": True, "node_count": node_count, "relationship_count": rel_count}
    except Exception as exc:
        return {"available": True, "connected": False, "error": str(exc)}


def qdrant_audit(story_id: str) -> dict[str, Any]:
    base = os.getenv("MANGA_QDRANT_URL", "http://localhost:6333").rstrip("/")
    result: dict[str, Any] = {"connected": False, "collections": {}}
    try:
        with httpx.Client(timeout=20.0) as client:
            collections = client.get(f"{base}/collections")
            collections.raise_for_status()
            result["connected"] = True
            names = [c["name"] for c in collections.json().get("result", {}).get("collections", [])]
            for name in names:
                scroll = client.post(
                    f"{base}/collections/{name}/points/scroll",
                    json={
                        "filter": {"must": [{"key": "story_id", "match": {"value": story_id}}]},
                        "limit": 100,
                        "with_payload": True,
                        "with_vector": False,
                    },
                )
                if scroll.status_code >= 400:
                    continue
                points = scroll.json().get("result", {}).get("points", [])
                if points:
                    result["collections"][name] = len(points)
    except Exception as exc:
        result["error"] = str(exc)
    return result


def ui_route_check(story_id: str, frontend_base: str) -> dict[str, Any]:
    routes = [
        "home",
        "seed",
        "world",
        "cast",
        "side",
        "web",
        "board",
        "scenes",
        "threads",
        "desk",
        "court",
        "script",
        "export",
        "timeline",
        "radar",
        "control",
    ]
    checked = []
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        root = client.get(frontend_base.rstrip("/"))
        checked.append({"route": "/", "status": root.status_code})
        require(root.status_code < 500, "frontend root should not 500")
        for route in routes:
            response = client.get(f"{frontend_base.rstrip('/')}/studio/{story_id}/{route}")
            checked.append({"route": route, "status": response.status_code})
            require(response.status_code < 500, f"frontend route {route} returned {response.status_code}")
    return {"frontend_base": frontend_base, "routes": checked}


def run(args: argparse.Namespace) -> dict[str, Any]:
    api = LiveApi(args.api_base)
    try:
        health = api.get("/health")
        require(health["databases"]["sqlite"]["status"] == "connected", "SQLite health check failed")
        require(health["databases"]["neo4j"]["can_connect"] is True, "Neo4j health check failed")
        require(health["databases"]["qdrant"]["can_connect"] is True, "Qdrant health check failed")
        llm = api.get("/llm/status")
        require(llm["real_llm_ready"] is True, "LLM server is not ready")
        api.get("/auth/me")
        api.get("/db/migration-info")
        api.get("/stories")

        story_id = setup_story(api)
        fill_foundation(api, story_id)
        fill_characters(api, story_id)
        fill_arc(api, story_id, FIRST_ARC_CHAPTERS)
        writing_workspace_flow(api, story_id)
        first_arc_versions = generate_first_arc_scripts(api, story_id)
        relationship_analysis = api.post(
            f"/stories/{story_id}/ai/analyze-relationships",
            params=[("chapter_ids", ch["chapter_id"]) for ch in FIRST_ARC_CHAPTERS],
        )
        first_export = export_and_check(api, story_id, [c["chapter_title"] for c in FIRST_ARC_CHAPTERS])
        second_arc_version = start_second_arc(api, story_id)
        second_export = export_and_check(api, story_id, [SECOND_ARC_CHAPTER["chapter_title"]])
        backend = backend_audit(api, story_id, first_arc_versions + [second_arc_version])
        sqlite = sqlite_audit(story_id)
        neo4j = neo4j_audit(story_id)
        qdrant = qdrant_audit(story_id)
        ui = ui_route_check(story_id, args.frontend_base)

        require(sqlite["counts"]["story_versions"] >= 3, "SQLite should have multiple version snapshots")
        require(sqlite["counts"]["vector_chunks"] >= 1, "SQLite vector mirror should have chunks")
        require(qdrant.get("connected") is True, "Qdrant audit should connect")
        require(sum(qdrant.get("collections", {}).values()) >= 1, "Qdrant should contain story points")
        require(neo4j.get("connected") is True, "Neo4j audit should connect")

        return {
            "passed": True,
            "story_id": story_id,
            "api_base": args.api_base,
            "frontend_base": args.frontend_base,
            "health": health,
            "llm": llm,
            "first_arc_versions": first_arc_versions,
            "second_arc_version": second_arc_version,
            "relationship_analysis": relationship_analysis,
            "first_export": first_export,
            "second_export": second_export,
            "backend_audit": backend,
            "sqlite_audit": sqlite,
            "neo4j_audit": neo4j,
            "qdrant_audit": qdrant,
            "ui_audit": ui,
            "api_call_count": len(api.calls),
            "api_calls": api.calls,
        }
    finally:
        api.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a real end-to-end story workflow against live Manga Maker services.")
    parser.add_argument("--api-base", default="http://localhost:8080/api/v1")
    parser.add_argument("--frontend-base", default="http://localhost:3000")
    args = parser.parse_args()
    try:
        report = run(args)
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"passed": True, "story_id": report["story_id"], "report": str(REPORT_PATH)}, indent=2))
        return 0
    except Exception as exc:
        failure = {
            "passed": False,
            "error_type": type(exc).__name__,
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        REPORT_PATH.write_text(json.dumps(failure, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(failure, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
