"""Unit tests for app.services.content_inspector — the shared "has content?" predicates."""

from app.services import content_inspector as ci


def test_has_content_strings_lists_dicts_scalars():
    assert ci.has_content("x")
    assert not ci.has_content("")
    assert not ci.has_content("   ")
    assert ci.has_content(["", "x"])
    assert not ci.has_content(["", "  ", []])
    assert ci.has_content({"selected": "Wide Shot", "options": ["a", "b"]})
    assert not ci.has_content({"selected": "", "options": ["a", "b"]})
    assert ci.has_content({"k": "v"})
    assert not ci.has_content({"options": ["a"]})  # "options" is ignored
    assert ci.has_content(0)        # a present scalar counts
    assert not ci.has_content(None)
    assert not ci.has_content(False)


def test_chapter_and_scene_has_content():
    assert ci.chapter_has_content({"chapter_title": "Ch 1"})
    assert ci.chapter_has_content({"summary": "stuff happens"})
    assert not ci.chapter_has_content({"chapter_id": "ch_001", "chapter_number": 1})  # ids/numbers don't count
    assert not ci.chapter_has_content({})
    assert ci.scene_has_content({"location": "The Office"})
    assert ci.scene_has_content({"scene_goal": "find the key"})
    assert not ci.scene_has_content({"scene_id": "s1", "scene_order": 2})


def test_meaningful_chapters_and_scenes_filter():
    chapters = [{"chapter_title": "A"}, {"chapter_id": "x"}, "not a dict", {"summary": "B"}]
    assert ci.meaningful_chapters(chapters) == [{"chapter_title": "A"}, {"summary": "B"}]
    scenes = [{"scene_goal": "g"}, {}, {"scene_id": "only-id"}]
    assert ci.meaningful_scenes(scenes) == [{"scene_goal": "g"}]


def test_page_has_content_via_purpose_panel_dialogue_sfx():
    assert ci.page_has_content({"page_purpose": "scene 1"})
    assert ci.page_has_content({"panels": [{"visual": "a wide street"}]})
    assert ci.page_has_content({"panels": [{"dialogue": [{"text": "Hi"}]}]})
    assert ci.page_has_content({"panels": [{"sound_effects": [{"sfx_text": "BANG"}]}]})
    assert not ci.page_has_content({"page_id": "p1", "page_number": 1, "panels": [{"panel_id": "x"}]})
    assert not ci.page_has_content({})


def test_meaningful_page_count_and_script_has_meaningful_pages():
    script = {"pages": [
        {"page_purpose": "p1"},
        {"page_id": "empty"},
        {"panels": [{"visual": "v"}]},
        "not a dict",
    ]}
    assert ci.meaningful_page_count(script) == 2
    assert ci.script_has_meaningful_pages(script) is True
    assert ci.meaningful_page_count({"pages": []}) == 0
    assert ci.script_has_meaningful_pages({}) is False


def test_plot_threads_have_content():
    assert ci.plot_threads_have_content({"main_plot_thread": {"goal": "stop the rift"}})
    assert ci.plot_threads_have_content({"relationship_threads": [{"summary": "rivalry"}]})
    assert not ci.plot_threads_have_content({"main_plot_thread": {"goal": "  "}, "relationship_threads": [{}]})
    assert not ci.plot_threads_have_content({})
    assert not ci.plot_threads_have_content("not a dict")
