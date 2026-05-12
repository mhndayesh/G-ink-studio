"""Unit tests for app.services.llm_context — the LLM context trimmer."""

from app.services import llm_context as lc


def test_clip_text_truncates_strings_with_ellipsis():
    assert lc.clip_text("hello world", 5) == "hello..."
    assert lc.clip_text("hi", 5) == "hi"          # short enough — unchanged, no "..."
    assert lc.clip_text("  spaced  ", 50) == "spaced"  # strips first


def test_clip_text_recurses_into_lists_and_dicts():
    assert lc.clip_text(["abcdef", "ghijkl"], 3) == ["abc...", "ghi..."]
    assert lc.clip_text({"a": "abcdef", "b": "x"}, 3) == {"a": "abc...", "b": "x"}
    # lists are capped at 12 items
    assert len(lc.clip_text(list("abcdefghijklmnop"), 5)) == 12


def test_clip_text_passes_non_text_through():
    assert lc.clip_text(7, 3) == 7
    assert lc.clip_text(None, 3) is None
    assert lc.clip_text(True, 3) is True


def test_compact_generation_context_returns_a_dict_for_each_page_without_crashing():
    for page in ("seed", "board", "threads", "scenes", "locations", "characters", "faction_visuals"):
        out = lc.compact_generation_context(page=page, context={}, generation_hints=None)
        assert isinstance(out, dict)
    # with hints + some context it still returns a dict
    out = lc.compact_generation_context(
        page="board",
        context={"master_story": {"idea_so_far": "x" * 999}, "characters": {}, "plot_outline": {}},
        generation_hints={"narrative_structure": "Kishotenketsu"},
    )
    assert isinstance(out, dict)
