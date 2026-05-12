"""Unit tests for app.services.export_shared — the low-level export helpers."""

from app.services import export_shared as sh


def test_safe():
    assert sh._safe(None) == ""
    assert sh._safe(None, "x") == "x"
    assert sh._safe("  hi  ") == "hi"
    assert sh._safe("   ", "fallback") == "fallback"
    assert sh._safe(42) == "42"


def test_selected_unwraps_selection_objects_and_lists():
    assert sh._selected({"selected": "Wide Shot", "options": ["a"]}) == "Wide Shot"
    assert sh._selected({"selected": ["a", "b"]}) == "a, b"
    assert sh._selected(["x", "y"]) == "x, y"
    assert sh._selected("plain") == "plain"
    assert sh._selected({"selected": ""}) == ""


def test_as_list():
    assert sh._as_list([1, 2]) == [1, 2]
    assert sh._as_list("not a list") == []
    assert sh._as_list(None) == []
    assert sh._as_list({"a": 1}) == []


def test_text_list_pulls_names_from_strings_and_dicts():
    assert sh._text_list(["a", " b ", ""]) == ["a", "b"]
    assert sh._text_list([{"name": "Kinji"}, {"title": "Ch 1"}, {"label": "x"}]) == ["Kinji", "Ch 1", "x"]
    assert sh._text_list([{"character_name": "Hina"}, {}]) == ["Hina"]  # empty dict yields nothing
    assert sh._text_list("not a list") == []


def test_append_field_only_appends_when_non_empty():
    lines: list[str] = []
    sh._append_field(lines, "Type", "Forest")
    sh._append_field(lines, "Empty", "")
    sh._append_field(lines, "Tags", ["a", "", "b"], indent="  ")
    sh._append_field(lines, "NoTags", [])
    assert lines == ["Type: Forest", "  Tags: a, b"]


def test_story_safe_title():
    assert sh.story_safe_title({"master_story": {"title": "My: Story!"}}) == ("My: Story!", "My__Story_")
    assert sh.story_safe_title({}, fallback="x") == ("x", "x")


def test_lines_to_text_and_markdown():
    lines = ["TITLE", "=" * 5, "", "Body line", "  indented"]
    assert sh._lines_to_text(lines) == "TITLE\n=====\n\nBody line\n  indented\n"  # joins with \n, trailing \n
    md = sh._lines_to_markdown(lines)
    assert md.startswith("# TITLE\n")          # `===` underline -> H1
    assert "Body line" in md and "  indented" in md
    assert "=====" not in md                    # the underline row itself is dropped


def test_build_loc_by_id_and_id_to_name():
    po = {"locations": {"locations": [
        {"location_id": "loc_a", "name": "Place A"},
        {"location_id": "", "name": "skipped"},   # no id -> skipped
        "not a dict",
    ]}}
    by_id = sh._build_loc_by_id(po)
    assert set(by_id) == {"loc_a"} and by_id["loc_a"]["name"] == "Place A"
    ch = {"character_relationship_map": {"relationships": [{"relationship_id": "rel_x", "characters_involved": "A / B"}]}}
    # _build_id_to_name maps relationship ids -> a display string; just check it returns a dict and doesn't crash
    assert isinstance(sh._build_id_to_name(ch), dict)
    assert isinstance(sh._build_id_to_name({}), dict)
