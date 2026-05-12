"""Unit tests for app.services.export_service helpers (the parts touched by the
visual-prompt policy and BUNDLE-AUDIT fixes)."""

from app.services import export_service as es
from app.services.visual_prompt import STYLE_PREFIX


def test_story_safe_title():
    # non-alnum (other than - _ space) -> "_", spaces -> "_", strip() only trims whitespace ends
    assert es.story_safe_title({"master_story": {"title": "My: Story!"}}) == ("My: Story!", "My__Story_")
    assert es.story_safe_title({"master_story": {"story_title": "Alt Title"}}) == ("Alt Title", "Alt_Title")
    assert es.story_safe_title({}, fallback="x") == ("x", "x")


def test_character_visual_phrases_pull_structured_fields_and_drop_noise():
    details = {
        "age_range": "late 20s", "body_type": "tall and thin", "hair_style": "messy black hair",
        "clothing_style": "faded charcoal suit", "iconic_item": "cigarette",
        "ai_image_prompt_notes": "noir atmosphere, cinematic lighting, highly detailed, masterpiece",
    }
    phrases = es._character_visual_phrases(details)
    joined = ", ".join(phrases).lower()
    assert "messy hair" in joined and "cigarette" in joined
    assert "black" not in joined and "charcoal" not in joined  # colour stripped
    assert "noir" not in joined and "cinematic" not in joined and "masterpiece" not in joined


def test_ai_prompt_files_are_clean_and_prefixed():
    chars = {"created_major_character_profiles": [{
        "character_name": "Kinji Sato",
        "appearance_and_visual_design": {"appearance_details": {
            "hair_style": "messy hair", "clothing_style": "faded suit",
            "ai_image_prompt_notes": "leaning against a brick wall, cinematic lighting",
            "negative_prompt_notes": "colorful, bright",
        }},
    }]}
    files = es._ai_prompt_files(chars)
    assert "Kinji_Sato.txt" in files
    body = files["Kinji_Sato.txt"]
    assert body.startswith("# Positive prompt\n" + STYLE_PREFIX + ", ")
    assert "cinematic" not in body.lower()
    assert "# Negative prompt" in body and "nsfw" in body


def test_panel_named_cast_count_counts_distinct_real_speakers():
    panel = {"dialogue": [
        {"speaker_name": "Kinji"}, {"speaker_name": "kinji"},  # same person, different case
        {"speaker_name": "Narrator"}, {"speaker_name": "Background Character"},
        {"speaker_name": "Hina"}, {"text": "no speaker"},
    ]}
    assert es._panel_named_cast_count(panel) == 2  # kinji + hina


def test_locations_section_prompts_are_clean_and_prefixed():
    po = {"locations": {"locations": [{
        "name": "Abandoned Office", "type": "Interior",
        "description": "desaturated steel blue palette, cold violet underlight, broken door, dust",
        "positive_prompt": "warm dim lighting, atmospheric dust particles, antique furniture",
    }]}}
    lines = es._locations_section_lines(po)
    text = "\n".join(lines)
    pos_line = next(l for l in lines if "AI prompt (positive)" in l)
    assert STYLE_PREFIX in pos_line
    assert "blue" not in pos_line.lower() and "violet" not in pos_line.lower()
    assert "cinematic" not in pos_line.lower() and "atmospheric" not in pos_line.lower()
    assert "broken door" in pos_line  # real structural detail kept
    assert any("AI prompt (negative)" in l and "nsfw" in l for l in lines)


def test_assemble_visuals_repairs_scrambled_page_location():
    po = {"locations": {"locations": [
        {"location_id": "loc_apt", "name": "Kinji's Apartment"},
        {"location_id": "loc_office", "name": "Iron Takeda's Office"},
    ]}}
    cs = {
        "chapter_metadata": {"chapter_number": 1, "chapter_id": "ch_001", "chapter_title": "X"},
        "chapter_scene_breakdown": [{"scene_id": "s1", "scene_title": "Scene 1", "location_id": "loc_office"}],
        "pages": [{
            "page_number": 1, "page_id": "p1", "scene_id": "s1", "location_id": "loc_office",
            "panels": [
                {"visual": "cramped apartment interior with peeling wallpaper"},
                {"visual": "apartment hallway", "background_details": "inside Kinji's Apartment"},
            ],
        }],
    }
    out = "\n".join(es._assemble_visuals_lines({"plot_outline": po, "chapter_script": cs}, all_scripts=[cs]))
    loc_line = next(l for l in out.splitlines() if "Location:" in l)
    assert "Kinji's Apartment" in loc_line
    assert "corrected from" in loc_line


def test_visuals_dialogue_labels_are_lowercased():
    cs = {
        "chapter_metadata": {"chapter_number": 1, "chapter_id": "ch_001", "chapter_title": "X"},
        "pages": [{"page_number": 1, "page_id": "p1", "scene_id": "s1", "panels": [
            {"visual": "a street", "dialogue": [
                {"speaker_name": "Kinji Sato", "text": "Hey."},
                {"speaker_name": "Narrator", "text": "Later that night."},  # skipped (narration)
            ]},
        ]}],
    }
    out = "\n".join(es._assemble_visuals_lines({"plot_outline": {}, "chapter_script": cs}, all_scripts=[cs]))
    assert 'Dialogue: kinji sato: "Hey."' in out
    assert "Kinji Sato:" not in out  # not the verbatim-cased form


def test_validate_export_flags_location_mismatch_and_prompt_noise():
    po = {
        "locations": {"locations": [
            {"location_id": "loc_apt", "name": "Kinji's Apartment", "positive_prompt": "warm amber lighting, cinematic"},
            {"location_id": "loc_office", "name": "Iron Takeda's Office"},
        ]},
        "chapter_or_episode_list": {"chapters": []},
        "scene_cards": {"scenes": []},
    }
    cs = {
        "chapter_metadata": {"chapter_number": 1, "chapter_id": "ch_001"},
        "chapter_scene_breakdown": [{"scene_id": "s1", "location": "Iron Takeda's Office"}],
        "pages": [{"page_number": 1, "scene_id": "s1", "location_id": "loc_office",
                   "panels": [{"visual": "cramped apartment interior"}, {"visual": "apartment hallway near Kinji's Apartment"}]}],
    }
    rep = es._validate_export({"plot_outline": po, "characters": {}, "master_story": {}}, [cs])
    cats = {w["category"] for w in rep["warnings"]}
    assert "location_mismatch" in cats
    assert "prompt_noise" in cats
    assert rep["count"] == len(rep["warnings"])
