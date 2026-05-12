"""Unit tests for app.services.visual_prompt — the B&W-manga visual-prompt policy."""

from app.services import visual_prompt as vp


def test_style_prefix_is_the_fixed_tag():
    assert vp.STYLE_PREFIX == "black and white Japanese manga style"


def test_compile_always_starts_with_style_prefix_exactly_once():
    out = vp.compile_visual_prompt("tall man, messy hair")
    assert out.startswith(vp.STYLE_PREFIX + ", ")
    assert out.lower().count(vp.STYLE_PREFIX.lower()) == 1


def test_compile_with_no_usable_content_returns_prefix_only():
    assert vp.compile_visual_prompt("", None, "  ") == vp.STYLE_PREFIX
    # a fragment that is entirely lighting/render noise collapses to nothing
    assert vp.compile_visual_prompt("cinematic lighting, atmospheric mood, masterpiece, 8k") == vp.STYLE_PREFIX


def test_compile_dedups_across_parts_case_insensitively():
    out = vp.compile_visual_prompt("messy hair, tired eyes", "Tired Eyes, cigarette")
    body = out[len(vp.STYLE_PREFIX) + 2:]
    phrases = [p.strip().lower() for p in body.split(",")]
    assert phrases.count("tired eyes") == 1
    assert "cigarette" in phrases


def test_sanitize_strips_colour_words_but_keeps_the_rest():
    out = vp.sanitize_visual_prompt("messy black hair, faded charcoal suit, crimson cloak")
    assert "black" not in out.lower()
    assert "charcoal" not in out.lower()
    assert "crimson" not in out.lower()
    assert "messy hair" in out
    assert "faded suit" in out
    assert "cloak" in out


def test_sanitize_drops_lighting_render_and_style_noise():
    dirty = ("noir atmosphere, cinematic lighting, highly detailed, masterpiece, "
             "8k, depth of field, anime style, cel shading, dynamic lighting")
    assert vp.sanitize_visual_prompt(dirty) == ""


def test_sanitize_keeps_value_words_like_high_contrast():
    out = vp.sanitize_visual_prompt("high contrast, deep shadows, broken window")
    assert "high contrast" in out
    assert "deep shadows" in out
    assert "broken window" in out


def test_sanitize_handles_non_string_input():
    assert vp.sanitize_visual_prompt(None) == ""
    assert vp.sanitize_visual_prompt(0) == ""
    assert vp.sanitize_visual_prompt(["unused"])  # str(list) is non-empty -> parsed, not crash


def test_negative_prompt_has_base_terms_and_appends_sanitised_extra():
    neg = vp.negative_prompt("colorful, bright lighting")
    assert "color" in neg and "nsfw" in neg
    # "bright lighting" carries the banned "lighting" word -> dropped from the extra
    assert "lighting" not in neg.split(", ")[-1] if neg.split(", ")[-1] != "" else True
    assert vp.negative_prompt() == vp.NEGATIVE_BASE


def test_canonical_camera_shot_drops_narrative_beats_and_blanks():
    assert vp.canonical_camera_shot("Action Shot") == ""
    assert vp.canonical_camera_shot("Reaction Shot") == ""
    assert vp.canonical_camera_shot("Custom") == ""
    assert vp.canonical_camera_shot("") == ""
    assert vp.canonical_camera_shot(None) == ""


def test_canonical_camera_shot_normalises_real_framings():
    assert vp.canonical_camera_shot("Over-The-Shoulder") == "over the shoulder"
    assert vp.canonical_camera_shot("Bird's-Eye View") == "birds eye view"
    assert vp.canonical_camera_shot("Establishing Shot") == "establishing shot"
    assert vp.canonical_camera_shot("Medium Shot") == "medium shot"
    assert vp.canonical_camera_shot("Low Angle") == "low angle"


def test_has_visual_noise():
    assert vp.has_visual_noise("warm amber lighting, cinematic")
    assert vp.has_visual_noise("messy black hair")        # colour word
    assert vp.has_visual_noise("desaturated steel blue color palette")
    assert not vp.has_visual_noise("messy hair, tired eyes, faded suit, cigarette")
    assert not vp.has_visual_noise("")
    assert not vp.has_visual_noise(None)


def test_render_mode_for_cast():
    assert vp.render_mode_for_cast(0) == ("t2i", "")
    assert vp.render_mode_for_cast(1) == ("i2i", "")
    assert vp.render_mode_for_cast(2) == ("i2i-2refs", "")
    mode, warn = vp.render_mode_for_cast(4)
    assert mode == "i2i-2refs"
    assert warn and "4 characters" in warn
    # negative / junk input clamps to 0
    assert vp.render_mode_for_cast(-3) == ("t2i", "")
    assert vp.render_mode_for_cast(None) == ("t2i", "")
