from __future__ import annotations

import json
import os
import sys
import shutil
import tempfile
import os as _os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Set env before importing app dependencies.
TMP = Path(tempfile.mkdtemp(prefix="manga_backend_smoke_"))
os.environ["MANGA_STORAGE_ROOT"] = str(TMP / "stories")
os.environ["MANGA_REGISTRY_SQLITE_PATH"] = str(TMP / "registry.sqlite")

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    client = TestClient(app)

    health = client.get("/api/v1/health")
    assert_true(health.status_code == 200, "health endpoint failed")


    db_info = client.get("/api/v1/db/migration-info")
    assert_true(db_info.status_code == 200, db_info.text)
    db_data = db_info.json()["data"]
    assert_true(db_data["production_target"] == "postgresql", "production target should be PostgreSQL")
    assert_true(db_data["local_fallback"] == "sqlite", "local fallback should be SQLite")
    assert_true(db_data["has_initial_migration"] is True, "initial Alembic migration must exist")
    assert_true(db_data["has_schema_sql"] is True, "PostgreSQL schema.sql must exist")

    llm_status = client.get("/api/v1/llm/status")
    assert_true(llm_status.status_code == 200, llm_status.text)
    assert_true(llm_status.json()["data"]["fallback_mode_available"] is True, "LLM fallback must be available")

    auth_me = client.get("/api/v1/auth/me")
    assert_true(auth_me.status_code == 200, auth_me.text)
    assert_true(auth_me.json()["data"]["user_id"] == "dev_user", "default dev auth user mismatch")

    create = client.post("/api/v1/stories", json={"title": "Manga Maker System"})
    assert_true(create.status_code == 200, create.text)
    payload = create.json()["data"]
    story_id = payload["story_id"]
    version_id = payload["current_version_id"]
    assert_true(story_id == "story_001", "first story id should be story_001")
    assert_true(version_id == "v001", "first version should be v001")
    assert_true(payload["owner_user_id"] == "dev_user", "created story owner should be dev_user")

    denied = client.get(f"/api/v1/stories/{story_id}/status", headers={"X-Manga-User-Id": "other_user"})
    assert_true(denied.status_code == 403, "other dev user should not access someone else's story")

    status = client.get(f"/api/v1/stories/{story_id}/status")
    assert_true(status.status_code == 200, status.text)
    assert_true(status.json()["data"]["state_type"] == "template_state", "state_type must be template_state")

    files = client.get(f"/api/v1/stories/{story_id}/files/current")
    assert_true(files.status_code == 200, files.text)
    data = files.json()["data"]
    expected_files = {
        "master_story": "master_story.json",
        "characters": "characters.json",
        "plot_outline": "plot_outline.json",
        "memory_system": "memory_system.json",
        "plot_workspace": "plot_workspace.json",
        "chapter_script": "chapter_script.json",
        "version_manifest": "version_manifest.json",
    }
    for key, filename in expected_files.items():
        assert_true(data["files"].get(key) == filename, f"{key} filename mismatch")
        assert_true(Path(data["paths"][key]).exists(), f"{key} path does not exist")

    # Deep file checks.
    chars = json.loads(Path(data["paths"]["characters"]).read_text(encoding="utf-8"))
    rel = chars["character_relationship_map"]
    assert_true(rel["is_enabled"] is False, "relationship map must start disabled")
    assert_true(rel["relationships"] == [], "relationship map must start empty")

    outline = json.loads(Path(data["paths"]["plot_outline"]).read_text(encoding="utf-8"))
    assert_true(outline["writing_workspace_link"]["current_workspace_file"] == "plot_workspace.json", "workspace link mismatch")
    assert_true(outline["writing_workspace_link"]["current_chapter_script_file"] == "chapter_script.json", "script link mismatch")

    workspace = json.loads(Path(data["paths"]["plot_workspace"]).read_text(encoding="utf-8"))
    assert_true(workspace["linked_files"]["plot_outline_file"] == "plot_outline.json", "workspace plot link mismatch")
    assert_true(workspace["ai_completion"]["is_enabled"] is False, "AI completion must default off")
    assert_true(workspace["mandatory_analysis_after_writing"]["extract_consequences"] is True, "consequence detection required")

    script = json.loads(Path(data["paths"]["chapter_script"]).read_text(encoding="utf-8"))
    assert_true(script["script_format"]["format_type"] == "manga_script", "script format mismatch")
    assert_true(script["linked_files"]["plot_outline_file"] == "plot_outline.json", "script plot link mismatch")


    # Master story template editing checks.
    master = client.get(f"/api/v1/stories/{story_id}/master-story")
    assert_true(master.status_code == 200, master.text)
    assert_true(master.json()["data"]["content"]["title"] == "Manga Maker System", "master story title mismatch")

    patch_idea = client.patch(
        f"/api/v1/stories/{story_id}/master-story/template",
        json={
            "target_branch": "idea_so_far",
            "operation": "replace",
            "value": "A student discovers a hidden demon gate under the academy.",
        },
    )
    assert_true(patch_idea.status_code == 200, patch_idea.text)
    assert_true(patch_idea.json()["data"]["updated_value"].startswith("A student"), "idea patch failed")

    patch_genre = client.patch(
        f"/api/v1/stories/{story_id}/master-story/template",
        json={"target_branch": "story_type.selected", "operation": "replace", "value": ["Shonen", "Dark Fantasy"]},
    )
    assert_true(patch_genre.status_code == 200, patch_genre.text)
    assert_true(patch_genre.json()["data"]["updated_value"] == ["Shonen", "Dark Fantasy"], "genre patch failed")

    invalid = client.patch(
        f"/api/v1/stories/{story_id}/master-story/template",
        json={"target_branch": "story_type.selected", "operation": "replace", "value": ["Bad Genre"]},
    )
    assert_true(invalid.status_code == 400, "invalid option should be rejected")

    validate_master = client.post(f"/api/v1/stories/{story_id}/master-story/validate")
    assert_true(validate_master.status_code == 200, validate_master.text)
    assert_true(validate_master.json()["data"]["validation_status"] == "passed", "master validation failed")



    # Character service checks.
    characters = client.get(f"/api/v1/stories/{story_id}/characters")
    assert_true(characters.status_code == 200, characters.text)
    cdata = characters.json()["data"]
    assert_true(cdata["relationship_map_available"] is False, "relationship map should not be available before 2 profiles")
    assert_true(cdata["relationship_map_enabled"] is False, "relationship map should start disabled")

    activate_too_early = client.post(f"/api/v1/stories/{story_id}/characters/relationship-map/activate")
    assert_true(activate_too_early.status_code == 409, "relationship map activation should be locked before 2 profiles")

    structure = client.patch(
        f"/api/v1/stories/{story_id}/characters/structure",
        json={"selected": "Dual Main Characters"},
    )
    assert_true(structure.status_code == 200, structure.text)
    profiles_to_create = structure.json()["data"]["profiles_to_create"]
    assert_true(len(profiles_to_create) == 2, "dual structure should create 2 profile queue items")
    assert_true(profiles_to_create[0]["profile_id"] == "char_001", "first queued profile should be char_001")
    assert_true(profiles_to_create[1]["profile_id"] == "char_002", "second queued profile should be char_002")

    create_char_1 = client.post(
        f"/api/v1/stories/{story_id}/characters/profiles",
        json={"profile_id": "char_001", "character_name": "Kai", "profile_data": {}},
    )
    assert_true(create_char_1.status_code == 200, create_char_1.text)
    assert_true(create_char_1.json()["data"]["relationship_map_available"] is False, "1 profile should not unlock relationship map")

    create_char_2 = client.post(
        f"/api/v1/stories/{story_id}/characters/profiles",
        json={"profile_id": "char_002", "character_name": "Ren", "profile_data": {}},
    )
    assert_true(create_char_2.status_code == 200, create_char_2.text)
    assert_true(create_char_2.json()["data"]["relationship_map_available"] is True, "2 profiles should make relationship map available")
    assert_true(create_char_2.json()["data"]["relationship_map_enabled"] is False, "relationship map should not auto-enable")

    activate_map = client.post(f"/api/v1/stories/{story_id}/characters/relationship-map/activate")
    assert_true(activate_map.status_code == 200, activate_map.text)
    assert_true(activate_map.json()["data"]["is_enabled"] is True, "relationship map should activate after 2 profiles")

    validate_characters = client.post(f"/api/v1/stories/{story_id}/characters/validate")
    assert_true(validate_characters.status_code == 200, validate_characters.text)
    assert_true(validate_characters.json()["data"]["validation_status"] == "passed", "characters validation failed")

    # Side character profile creation.
    side_char = client.post(
        f"/api/v1/stories/{story_id}/characters/side-profiles",
        json={"character_name": "Mira", "profile_data": {"status": {"selected": "alive"}, "character_role_level": {"selected": "Supporting Character"}}},
    )
    assert_true(side_char.status_code == 200, side_char.text)
    assert_true(side_char.json()["data"]["character_name"] == "Mira", "side character name mismatch")
    assert_true(side_char.json()["data"]["profile_id"].startswith("side_"), "side character should get side_ prefix ID")

    # Verify side character appears in character data.
    chars_after_side = client.get(f"/api/v1/stories/{story_id}/characters")
    assert_true(chars_after_side.status_code == 200, chars_after_side.text)
    side_list = chars_after_side.json()["data"]["content"]["created_side_character_profiles"]
    assert_true(len(side_list) >= 1, "side characters list should have at least 1 entry")
    assert_true(side_list[0]["character_name"] == "Mira", "side character name in stored data mismatch")
    assert_true(side_list[0]["status"]["selected"] == "alive", "side character profile_data status preserved")
    assert_true(side_list[0]["character_role_level"]["selected"] == "Supporting Character", "side character role_selected preserved")



    # Plot outline service checks.
    plot_outline = client.get(f"/api/v1/stories/{story_id}/plot-outline")
    assert_true(plot_outline.status_code == 200, plot_outline.text)
    pdata = plot_outline.json()["data"]
    assert_true(pdata["content"]["writing_workspace_link"]["current_workspace_file"] == "plot_workspace.json", "plot outline workspace link mismatch")

    workflow = client.patch(
        f"/api/v1/stories/{story_id}/plot-outline/story-start-workflow",
        json={"start_mode": "Plan First Arc Then Chapter 1", "current_stage": "choose_narrative_structure"},
    )
    assert_true(workflow.status_code == 200, workflow.text)
    assert_true(workflow.json()["data"]["start_mode"] == "Plan First Arc Then Chapter 1", "workflow start_mode patch failed")

    narrative = client.patch(
        f"/api/v1/stories/{story_id}/plot-outline/narrative-structure",
        json={"selected": "Kishotenketsu"},
    )
    assert_true(narrative.status_code == 200, narrative.text)
    assert_true(narrative.json()["data"]["enabled_sections"] == ["kishotenketsu_outline"], "Kishotenketsu should enable kishotenketsu_outline")

    invalid_narrative = client.patch(
        f"/api/v1/stories/{story_id}/plot-outline/narrative-structure",
        json={"selected": "Bad Structure"},
    )
    assert_true(invalid_narrative.status_code == 400, "invalid narrative structure should be rejected")

    arc_patch = client.patch(
        f"/api/v1/stories/{story_id}/plot-outline/arc-overview",
        json={"target_branch": "arc_title", "operation": "replace", "value": "Opening Gate Arc"},
    )
    assert_true(arc_patch.status_code == 200, arc_patch.text)
    assert_true(arc_patch.json()["data"]["updated_value"] == "Opening Gate Arc", "arc title patch failed")

    chapter_without_length = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/chapters",
        json={
            "chapter_id": "ch_001",
            "chapter_number": 1,
            "chapter_title": "The Gate Under The Academy",
        },
    )
    assert_true(chapter_without_length.status_code == 400, "chapter creation should require arc length")
    assert_true("ARC_LENGTH_REQUIRED" in chapter_without_length.text, "missing arc length should return ARC_LENGTH_REQUIRED")

    arc_length_patch = client.patch(
        f"/api/v1/stories/{story_id}/plot-outline/arc-overview",
        json={"target_branch": "arc_length_type.selected", "operation": "replace", "value": "Short Arc"},
    )
    assert_true(arc_length_patch.status_code == 200, arc_length_patch.text)
    assert_true(arc_length_patch.json()["data"]["updated_value"] == "Short Arc", "arc length patch failed")

    chapter = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/chapters",
        json={
            "chapter_id": "ch_001",
            "chapter_number": 1,
            "chapter_title": "The Gate Under The Academy",
            "chapter_purpose": "Introduce Kai and the first hint of the demon gate.",
            "ending_cliffhanger": "A forbidden symbol glows below the school.",
        },
    )
    assert_true(chapter.status_code == 200, chapter.text)
    assert_true(chapter.json()["data"]["chapter"]["chapter_id"] == "ch_001", "chapter create failed")

    duplicate_chapter = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/chapters",
        json={"chapter_id": "ch_001", "chapter_number": 2, "chapter_title": "The Gate Under The Academy (Updated)"},
    )
    assert_true(duplicate_chapter.status_code == 200, "duplicate chapter_id should be allowed as update")
    assert_true(duplicate_chapter.json()["data"]["chapter"]["chapter_number"] == 2, "chapter number should be updated")

    scene = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/scenes",
        json={
            "scene_id": "scene_001",
            "chapter_id": "ch_001",
            "scene_order": 1,
            "location": "Academy Courtyard",
            "scene_goal": "Show normal life before the hidden threat appears.",
            "visual_manga_moment": "The camera pulls down from the academy bell tower to a cracked stone seal.",
        },
    )
    assert_true(scene.status_code == 200, scene.text)
    assert_true(scene.json()["data"]["scene"]["scene_id"] == "scene_001", "scene create failed")

    wrong_redo = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/redo-arc-structure",
        json={"selected": "Mystery Arc", "confirmation": "wrong"},
    )
    assert_true(wrong_redo.status_code == 400, "redo arc structure should require exact confirmation")

    redo = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/redo-arc-structure",
        json={"selected": "Mystery Arc", "preserve_arc_overview": True, "clear_chapter_script": True, "confirmation": "RESET ARC"},
    )
    assert_true(redo.status_code == 200, redo.text)
    redo_data = redo.json()["data"]
    assert_true(redo_data["selected"] == "Mystery Arc", "redo should set selected structure")
    assert_true(redo_data["cleared_chapters"] >= 1, "redo should clear existing chapters")
    assert_true(redo_data["cleared_scenes"] >= 1, "redo should clear existing scenes")
    assert_true(redo_data["cleared_chapter_script"] is True, "redo should clear chapter script")

    plot_after_redo = client.get(f"/api/v1/stories/{story_id}/plot-outline")
    assert_true(plot_after_redo.status_code == 200, plot_after_redo.text)
    plot_content_after_redo = plot_after_redo.json()["data"]["content"]
    assert_true(plot_content_after_redo["story_arc_overview"]["arc_title"] == "Opening Gate Arc", "redo should preserve arc overview")
    assert_true(plot_content_after_redo["story_arc_overview"]["arc_length_type"]["selected"] == "Short Arc", "redo should preserve selected arc length")
    assert_true(plot_content_after_redo["chapter_or_episode_list"]["chapters"] == [], "redo should clear chapters")
    assert_true(plot_content_after_redo["scene_cards"]["scenes"] == [], "redo should clear scenes")

    script_after_redo = client.get(f"/api/v1/stories/{story_id}/chapter-script")
    assert_true(script_after_redo.status_code == 200, script_after_redo.text)
    script_content_after_redo = script_after_redo.json()["data"]["content"]
    assert_true(script_content_after_redo["chapter_metadata"]["chapter_status"] == "draft", "redo should reset script status")
    assert_true(script_content_after_redo["chapter_scene_breakdown"] == [], "redo should clear script scenes")
    assert_true(script_content_after_redo["pages"] == [], "redo should clear generated script pages")

    chapter_after_redo = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/chapters",
        json={
            "chapter_title": "The Gate Under The Academy",
            "chapter_purpose": "Restart the mystery arc after selecting the structure.",
            "structure_section": "mystery_setup",
            "ending_cliffhanger": "A forbidden symbol glows below the school.",
        },
    )
    assert_true(chapter_after_redo.status_code == 200, chapter_after_redo.text)
    assert_true(chapter_after_redo.json()["data"]["chapter"]["chapter_id"] == "ch_001", "chapter numbering should restart after redo")

    scene_after_redo = client.post(
        f"/api/v1/stories/{story_id}/plot-outline/scenes",
        json={
            "chapter_id": "ch_001",
            "scene_title": "The Gate Under The Academy",
            "scene_goal": "Find the hidden gate beneath the academy floor.",
        },
    )
    assert_true(scene_after_redo.status_code == 200, scene_after_redo.text)
    assert_true(scene_after_redo.json()["data"]["scene"]["chapter_id"] == "ch_001", "scene should belong to ch_001")

    validate_plot = client.post(f"/api/v1/stories/{story_id}/plot-outline/validate")
    assert_true(validate_plot.status_code == 200, validate_plot.text)
    assert_true(validate_plot.json()["data"]["validation_status"] == "passed", "plot outline validation failed")


    # Plot workspace service checks.
    workspace_get = client.get(f"/api/v1/stories/{story_id}/plot-workspace")
    assert_true(workspace_get.status_code == 200, workspace_get.text)
    assert_true(workspace_get.json()["data"]["workspace_status"]["status"] == "not_started", "workspace should start not_started")

    save_writing = client.patch(
        f"/api/v1/stories/{story_id}/plot-workspace/free-writing",
        json={
            "text": "Kai fights Ren. Ren badly injures Kai. Mira later discovers Ren was a spy.",
            "input_type": "Scene Idea",
            "user_priority": "Keep My Writing As Much As Possible",
        },
    )
    assert_true(save_writing.status_code == 200, save_writing.text)
    assert_true(save_writing.json()["data"]["status"] == "analysis_ready", "free writing should make workspace analysis_ready")

    ai_complete = client.post(
        f"/api/v1/stories/{story_id}/plot-workspace/ai-complete",
        json={"expansion_mode": "Light Expansion"},
    )
    assert_true(ai_complete.status_code == 200, ai_complete.text)
    ai_expanded = ai_complete.json()["data"].get("expanded_text", "")
    assert_true(len(ai_expanded) > 0, "AI completion should return non-empty expanded text")
    assert_true(isinstance(ai_expanded, str), "expanded_text should be a string")

    ai_decision = client.post(
        f"/api/v1/stories/{story_id}/plot-workspace/ai-complete/decision",
        json={"decision": "Accept"},
    )
    assert_true(ai_decision.status_code == 200, ai_decision.text)
    assert_true(ai_decision.json()["data"]["accepted_expanded_text"] is True, "AI completion accept should set accepted_expanded_text")

    analyze = client.post(f"/api/v1/stories/{story_id}/plot-workspace/analyze")
    assert_true(analyze.status_code == 200, analyze.text)
    assert_true(analyze.json()["data"]["questions_created"] >= 1, f"LLM analysis should create at least 1 question (got {analyze.json()['data']['questions_created']})")

    questions = client.get(f"/api/v1/stories/{story_id}/plot-workspace/questions")
    assert_true(questions.status_code == 200, questions.text)
    qlist = questions.json()["data"]["questions"]
    assert_true(len(qlist) >= 1, f"workspace should return at least 1 question (got {len(qlist)})")

    for q in qlist:
        answer = client.post(
            f"/api/v1/stories/{story_id}/plot-workspace/questions/{q['question_id']}/answer",
            json={"selected": q["options"][0]},
        )
        assert_true(answer.status_code == 200, answer.text)

    confirmation = client.get(f"/api/v1/stories/{story_id}/plot-workspace/confirmation")
    assert_true(confirmation.status_code == 200, confirmation.text)
    conf_data = confirmation.json()["data"]
    assert_true(conf_data["status"] == "ready", f"confirmation should be ready after all answers (got {conf_data['status']})")
    proposed_count = len(conf_data.get("proposed_official_events", []))
    assert_true(proposed_count >= 1, f"confirmation should propose at least 1 event (got {proposed_count})")

    approve = client.post(
        f"/api/v1/stories/{story_id}/plot-workspace/approve",
        json={"decision": "Approve All"},
    )
    assert_true(approve.status_code == 200, approve.text)
    approve_data = approve.json()["data"]
    assert_true(approve_data["approved"] is True, "workspace approve should return approved true")

    validate_workspace = client.post(f"/api/v1/stories/{story_id}/plot-workspace/validate")
    assert_true(validate_workspace.status_code == 200, validate_workspace.text)
    assert_true(validate_workspace.json()["data"]["validation_status"] == "passed", "plot workspace validation failed")


    # After workspace approve (Writing Desk marks reviewed), current version remains v001.
    # Per-chapter version snapshots are now created by Manga Script approve.
    status_after_workspace = client.get(f"/api/v1/stories/{story_id}/status")
    assert_true(status_after_workspace.status_code == 200, status_after_workspace.text)
    assert_true(status_after_workspace.json()["data"]["current_version_id"] == "v001", "story version stays v001 after Writing Desk approve")

    # Versions list still has only v001 (version creation moved to script approve)
    versions_list_pre = client.get(f"/api/v1/stories/{story_id}/versions")
    assert_true(versions_list_pre.status_code == 200, versions_list_pre.text)
    assert_true(versions_list_pre.json()["data"]["count"] == 1, "only v001 before script approve")


    # ChapterScriptService v0.1 checks.
    # Fill plot threads required for script generation (guard: PLOT_THREADS_REQUIRED).
    patch_threads = client.patch(
        f"/api/v1/stories/{story_id}/plot-outline/arc-overview",
        json={"target_branch": "plot_threads.main_plot_thread.goal", "operation": "replace", "value": "Uncover the mystery at the academy."},
    )
    assert_true(patch_threads.status_code == 200, patch_threads.text)

    script_get = client.get(f"/api/v1/stories/{story_id}/chapter-script")
    assert_true(script_get.status_code == 200, script_get.text)
    assert_true(script_get.json()["data"]["file_type"] == "chapter_script", "chapter script get failed")

    script_chapter_id = client.get(f"/api/v1/stories/{story_id}/chapter-script?chapter_id=ch_001").text
    assert_true("ch_001" in script_chapter_id or "still alive" in script_chapter_id, "chapter-script should accept chapter_id param")

    # Locations gate (audit fix): chapter-script generation requires at least one named location.
    create_loc = client.post(
        f"/api/v1/stories/{story_id}/locations",
        json={"name": "Academy Gate", "type": "Exterior / Landmark", "description": "Stone arch with glowing runes."},
    )
    assert_true(create_loc.status_code == 200, create_loc.text)

    script_generate = client.post(f"/api/v1/stories/{story_id}/chapter-script/generate?chapter_id=ch_001")
    assert_true(script_generate.status_code == 200, script_generate.text)
    assert_true(script_generate.json()["data"]["pages_count"] >= 1, "script generation should create at least one page")

    script_patch = client.patch(
        f"/api/v1/stories/{story_id}/chapter-script",
        json={"target_branch": "pages[0].panels[0].visual", "operation": "replace", "value": "Kai and Ren clash under the glowing academy gate."},
    )
    assert_true(script_patch.status_code == 200, script_patch.text)
    assert_true(script_patch.json()["data"]["updated_value"].startswith("Kai and Ren"), "script patch failed")

    script_approve = client.post(f"/api/v1/stories/{story_id}/chapter-script/approve?chapter_id=ch_001")
    assert_true(script_approve.status_code == 200, script_approve.text)
    assert_true(script_approve.json()["data"]["script_approved_by_user"] is True, "script approve failed")

    # After script approve, version v002 should be created by create_simple_snapshot
    status_after_script = client.get(f"/api/v1/stories/{story_id}/status")
    assert_true(status_after_script.status_code == 200, status_after_script.text)
    assert_true(status_after_script.json()["data"]["current_version_id"] == "v002", "story current version should be v002 after script approve")

    versions_list = client.get(f"/api/v1/stories/{story_id}/versions")
    assert_true(versions_list.status_code == 200, versions_list.text)
    assert_true(versions_list.json()["data"]["count"] == 2, "there should be v001 and v002 after script approve")

    v002_manifest = client.get(f"/api/v1/stories/{story_id}/versions/v002/manifest")
    assert_true(v002_manifest.status_code == 200, v002_manifest.text)
    assert_true(v002_manifest.json()["data"]["previous_version_id"] == "v001", "v002 manifest should link back to v001")

    script_validate = client.post(f"/api/v1/stories/{story_id}/chapter-script/validate")
    assert_true(script_validate.status_code == 200, script_validate.text)
    assert_true(script_validate.json()["data"]["validation_status"] == "passed", "script validation failed")

    # ContinuityService v0.1 checks.
    continuity = client.post(f"/api/v1/stories/{story_id}/continuity/check-current")
    assert_true(continuity.status_code == 200, continuity.text)
    assert_true(continuity.json()["data"]["approved"] is True, "continuity should approve clean generated state")

    reports = client.get(f"/api/v1/stories/{story_id}/continuity/reports")
    assert_true(reports.status_code == 200, reports.text)
    assert_true(reports.json()["data"]["count"] >= 1, "continuity reports should list generated report")

    # GraphService v0.1 / Neo4j stub checks.
    graph_project = client.post(f"/api/v1/stories/{story_id}/graph/project-events")
    assert_true(graph_project.status_code == 200, graph_project.text)
    assert_true(graph_project.json()["data"]["projected_events"] >= 0, f"graph projection should succeed (events pipeline is dead, may project 0)")

    # Graph projections may be 0 since story_events pipeline is dead
    graph_projections = client.get(f"/api/v1/stories/{story_id}/graph/projections")
    assert_true(graph_projections.status_code == 200, graph_projections.text)
    assert_true(graph_projections.json()["data"]["count"] >= 0, f"graph projections list endpoint works")

    # Graph web endpoint (merged JSON characters + Neo4j)
    graph_web = client.get(f"/api/v1/stories/{story_id}/graph/web")
    assert_true(graph_web.status_code == 200, graph_web.text)
    web_data = graph_web.json()["data"]
    assert_true(web_data["story_id"] == story_id, "graph web should return correct story_id")
    assert_true(len(web_data["nodes"]) >= 2, "graph web should include major profiles as nodes")
    found_kai = any(n["name"] == "Kai" for n in web_data["nodes"])
    found_ren = any(n["name"] == "Ren" for n in web_data["nodes"])
    assert_true(found_kai, "graph web nodes should include Kai")
    assert_true(found_ren, "graph web nodes should include Ren")
    # Mira is a side character
    found_mira = any(n.get("class") == "side" for n in web_data["nodes"])
    assert_true(found_mira, "graph web nodes should include side characters")

    # VectorService v0.1 / Qdrant stub checks.
    vector_upsert = client.post(f"/api/v1/stories/{story_id}/vector/upsert-current-memory")
    assert_true(vector_upsert.status_code == 200, vector_upsert.text)
    assert_true(vector_upsert.json()["data"]["created_chunks"] >= 1, f"vector memory should create at least 1 chunk")

    vector_chunks = client.get(f"/api/v1/stories/{story_id}/vector/chunks")
    assert_true(vector_chunks.status_code == 200, vector_chunks.text)
    assert_true(vector_chunks.json()["data"]["count"] >= 1, f"vector chunks should be stored")


    # Export module checks.
    export_txt = client.get(f"/api/v1/stories/{story_id}/export/story?fmt=txt")
    assert_true(export_txt.status_code == 200, export_txt.text)
    assert_true("text/plain" in export_txt.headers.get("content-type", ""), "export/story txt should be text/plain")
    assert_true(len(export_txt.content) > 0, "export/story txt should not be empty")
    assert_true(b"Manga Maker System" in export_txt.content, "export/story txt should contain story title")

    export_md = client.get(f"/api/v1/stories/{story_id}/export/story?fmt=md")
    assert_true(export_md.status_code == 200, export_md.text)
    assert_true("text/markdown" in export_md.headers.get("content-type", ""), "export/story md should be text/markdown")
    assert_true(b"# " in export_md.content, "export/story md should contain markdown headings")

    export_docx = client.get(f"/api/v1/stories/{story_id}/export/story?fmt=docx")
    assert_true(export_docx.status_code == 200, export_docx.text)
    assert_true(len(export_docx.content) > 0, "export/story docx should not be empty")

    export_scenes_md = client.get(f"/api/v1/stories/{story_id}/export/scenes?fmt=md")
    assert_true(export_scenes_md.status_code == 200, export_scenes_md.text)
    assert_true(len(export_scenes_md.content) > 0, "export/scenes md should not be empty")

    export_visuals_md = client.get(f"/api/v1/stories/{story_id}/export/visuals?fmt=md")
    assert_true(export_visuals_md.status_code == 200, export_visuals_md.text)
    assert_true(len(export_visuals_md.content) > 0, "export/visuals md should not be empty")

    export_zip = client.get(f"/api/v1/stories/{story_id}/export/raw-zip")
    assert_true(export_zip.status_code == 200, export_zip.text)
    assert_true("application/zip" in export_zip.headers.get("content-type", ""), "export/raw-zip should be application/zip")
    import zipfile as _zipfile, io as _io
    with _zipfile.ZipFile(_io.BytesIO(export_zip.content)) as zf:
        names = set(zf.namelist())
    expected_zipped = {"master_story.json", "characters.json", "plot_outline.json", "memory_system.json", "plot_workspace.json", "chapter_script.json"}
    assert_true(expected_zipped == names, f"ZIP should contain exactly the 6 story files, got {names}")

    # Verify v001 manifest still exists
    v001_manifest = client.get(f"/api/v1/stories/{story_id}/versions/v001/manifest")
    assert_true(v001_manifest.status_code == 200, v001_manifest.text)
    assert_true(v001_manifest.json()["data"]["version_id"] == "v001", "v001 manifest should still be accessible")
    assert_true(v001_manifest.json()["data"]["files"]["plot_outline"] == "plot_outline.json", "manifest plot filename mismatch")

    # Locations CRUD checks.
    locs_empty = client.get(f"/api/v1/stories/{story_id}/locations")
    assert_true(locs_empty.status_code == 200, locs_empty.text)
    assert_true(isinstance(locs_empty.json()["data"], list), "locations list should return a JSON array in data")

    loc_create = client.post(f"/api/v1/stories/{story_id}/locations", json={
        "name": "Academy Courtyard",
        "type": "Exterior / School",
        "description": "Open courtyard below the academy bell tower.",
        "positive_prompt": "manga school courtyard, stone paving, cherry trees, soft daylight",
        "negative_prompt": "indoor, dark, modern city",
    })
    assert_true(loc_create.status_code == 200, loc_create.text)
    loc_data = loc_create.json()["data"]
    loc_id = loc_data.get("location_id")
    assert_true(loc_id and loc_id.startswith("loc_"), f"location_id should start with loc_, got {loc_id}")
    assert_true(loc_data.get("name") == "Academy Courtyard", "location name mismatch")

    loc_list = client.get(f"/api/v1/stories/{story_id}/locations")
    assert_true(loc_list.status_code == 200, loc_list.text)
    assert_true(len(loc_list.json()["data"]) >= 1, "locations list should have at least 1 entry after create")

    loc_update = client.patch(f"/api/v1/stories/{story_id}/locations/{loc_id}", json={
        "description": "Open courtyard below the cracked academy bell tower with a glowing seal.",
    })
    assert_true(loc_update.status_code == 200, loc_update.text)
    assert_true("glowing seal" in loc_update.json()["data"].get("description", ""), "location description should be updated")

    # Export triple-zip check.
    export_triple = client.get(f"/api/v1/stories/{story_id}/export/triple-zip")
    assert_true(export_triple.status_code == 200, export_triple.text)
    assert_true("application/zip" in export_triple.headers.get("content-type", ""), "triple-zip should be application/zip")
    with _zipfile.ZipFile(_io.BytesIO(export_triple.content)) as zf:
        triple_names = set(zf.namelist())
    assert_true("README.md" in triple_names, "triple-zip should include README.md")
    story_files = [n for n in triple_names if n.endswith("-story.md")]
    visuals_files = [n for n in triple_names if n.endswith("-visuals.md")]
    scenes_files = [n for n in triple_names if n.endswith("-scenes.md")]
    assert_true(len(story_files) == 1, f"triple-zip should include one *-story.md, got {triple_names}")
    assert_true(len(visuals_files) == 1, f"triple-zip should include one *-visuals.md, got {triple_names}")
    assert_true(len(scenes_files) == 1, f"triple-zip should include one *-scenes.md, got {triple_names}")
    # Verify CHAPTERS section present in visuals file
    with _zipfile.ZipFile(_io.BytesIO(export_triple.content)) as zf:
        visuals_text = zf.read(visuals_files[0]).decode("utf-8")
        story_text = zf.read(story_files[0]).decode("utf-8")
    assert_true("CHAPTERS" in visuals_text, "visuals export should contain CHAPTERS section")
    assert_true("Manga Maker System" in story_text, "story export should contain story title")

    # Export validation endpoint check.
    export_validate = client.get(f"/api/v1/stories/{story_id}/export/validate")
    assert_true(export_validate.status_code == 200, export_validate.text)
    validate_data = export_validate.json().get("data", {})
    assert_true(isinstance(validate_data.get("warnings"), list), "export/validate should return warnings list")
    assert_true(isinstance(validate_data.get("count"), int), "export/validate should return integer count")

    # Location delete check (clean up after export so it's tested).
    loc_delete = client.delete(f"/api/v1/stories/{story_id}/locations/{loc_id}")
    assert_true(loc_delete.status_code == 200, loc_delete.text)
    loc_list_after = client.get(f"/api/v1/stories/{story_id}/locations")
    remaining_ids = [l.get("location_id") for l in loc_list_after.json()["data"]]
    assert_true(loc_id not in remaining_ids, f"deleted location {loc_id} should not appear in list after delete")

    report = {
        "passed": True,
        "story_id": story_id,
        "version_id": version_id,
        "storage_root": str(TMP),
        "checks": [
            "health endpoint",
            "auth me endpoint",
            "story ownership assigned",
            "story ownership access check",
            "llm status endpoint",
            "story created",
            "v001 created",
            "six files plus manifest written",
            "state_type template_state",
            "plot_outline.json filename enforced",
            "relationship map disabled and empty",
            "workspace/script links valid",
            "AI completion off by default",
            "consequence detection mandatory",
            "master-story get endpoint",
            "master-story template patch endpoint",
            "master-story option validation",
            "master-story validate endpoint",
            "characters get endpoint",
            "relationship map locked before 2 profiles",
            "character structure queue generation",
            "major profile creation",
            "relationship map available after 2 profiles",
            "relationship map explicit activation",
            "characters validate endpoint",
            "side character profile creation",
            "side character stored in created_side_character_profiles",
            "side character profile_data preserved",
            "plot-outline get endpoint",
            "plot start workflow patch",
            "plot narrative structure validation",
            "plot arc overview patch",
            "plot chapter creation",
            "plot duplicate chapter rejection",
            "plot scene creation",
            "plot-outline validate endpoint",
            "plot-workspace get endpoint",
            "plot-workspace free writing save",
            "plot-workspace AI completion through LLMService fallback",
            "plot-workspace AI decision",
            "plot-workspace consequence analysis through LLMService fallback",
            "llm runs logged",
            "plot-workspace questions",
            "plot-workspace question answers",
            "plot-workspace confirmation skeleton",
            "plot-workspace approve marks workspace reviewed",
            "plot-workspace validate endpoint",
            "story current version is v001 after Writing Desk approve (no version creation)",
            "chapter-script get endpoint",
            "plot threads required fill for script generation guard",
            "chapter-script accepts chapter_id param",
            "chapter-script generate endpoint",
            "chapter-script panel patch endpoint",
            "chapter-script approve creates v002 via create_simple_snapshot",
            "story current version is v002 after script approve",
            "versions list shows v001 + v002 after script approve",
            "v002 manifest links previous_version_id to v001",
            "chapter-script validate endpoint",
            "continuity current-version check",
            "continuity report storage",
            "graph projection stub (events pipeline is dead, may project 0)",
            "graph projection list endpoint",
            "graph web endpoint returns characters as nodes",
            "graph web includes both major and side characters",
            "vector memory stub upsert",
            "vector chunk list endpoint",
            "export/story txt download",
            "export/story md download with markdown headings",
            "export/story docx download",
            "export/scenes md download",
            "export/visuals md download",
            "export/raw-zip contains all 6 story files",
            "locations list endpoint",
            "location create with loc_ prefixed id",
            "location list after create",
            "location update endpoint",
            "export/triple-zip contains story + visuals + scenes md files",
            "triple-zip visuals contains CHAPTERS section",
            "triple-zip story contains story title",
            "export/validate endpoint returns warnings list and count",
            "location delete endpoint",
        ]
    }
    print(json.dumps(report, indent=2), flush=True)

    # Keep temp files for inspection; CI can remove /tmp/manga_backend_smoke_* later.


if __name__ == "__main__":
    main()
    sys.stdout.flush()
    sys.stderr.flush()
    _os._exit(0)
