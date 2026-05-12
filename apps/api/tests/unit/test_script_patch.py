"""Unit tests for app.services.script_patch — the patch-by-path engine."""

import pytest

from app.core.errors import MangaMakerError
from app.services import script_patch as sp


def _doc():
    return {"pages": [{"page_id": "p1", "panels": [{"visual": "old", "tags": ["a"]}]}], "meta": {"n": 1}}


def test_path_tokens_parses_dotted_and_bracketed():
    assert sp.path_tokens("pages[0].panels[2].visual") == ["pages", 0, "panels", 2, "visual"]
    assert sp.path_tokens("meta.n") == ["meta", "n"]
    assert sp.path_tokens("") == []


def test_get_value():
    d = _doc()
    assert sp.get_value(d, "meta.n") == 1
    assert sp.get_value(d, "pages[0].panels[0].visual") == "old"


def test_apply_patch_replace_returns_old_value_and_mutates():
    d = _doc()
    old = sp.apply_patch(d, "pages[0].panels[0].visual", "replace", "new")
    assert old == "old"
    assert d["pages"][0]["panels"][0]["visual"] == "new"


def test_apply_patch_add_merge_append():
    d = _doc()
    sp.apply_patch(d, "meta.created", "add", "2026")
    assert d["meta"]["created"] == "2026"
    sp.apply_patch(d, "meta", "merge_object", {"author": "x"})
    assert d["meta"]["author"] == "x" and d["meta"]["n"] == 1
    sp.apply_patch(d, "pages[0].panels[0].tags", "append_to_array", "b")
    assert d["pages"][0]["panels"][0]["tags"] == ["a", "b"]


def test_apply_patch_remove():
    d = _doc()
    sp.apply_patch(d, "meta.n", "remove", None)
    assert "n" not in d["meta"]
    # removing a list element by index
    d2 = {"items": [10, 20, 30]}
    sp.apply_patch(d2, "items[1]", "remove", None)
    assert d2["items"] == [10, 30]


def test_apply_patch_errors():
    with pytest.raises(MangaMakerError):
        sp.apply_patch(_doc(), "pages[5].x", "replace", 1)          # path not found
    with pytest.raises(MangaMakerError):
        sp.apply_patch(_doc(), "meta.missing", "replace", 1)        # replace requires existing key
    with pytest.raises(MangaMakerError):
        sp.apply_patch(_doc(), "meta", "merge_object", "not a dict")  # type error
    with pytest.raises(MangaMakerError):
        sp.apply_patch(_doc(), "meta.n", "frobnicate", 1)          # unsupported op
