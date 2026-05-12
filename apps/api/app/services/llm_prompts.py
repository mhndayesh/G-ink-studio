from __future__ import annotations

"""Prompt/schema fragments for the LLM service.

``field_schema_hint(page, target_fields)`` returns the JSON-shape hint appended to
the user prompt so the model knows exactly which fields to fill and in what shape.
Kept out of llm_service.py because it is a large static mapping with no behaviour.
"""

from app.services.visual_prompt import STYLE_INSTRUCTION

def field_schema_hint(page: str, target_fields: list[str]) -> str:
    schemas: dict[str, dict[str, str]] = {
        "cast": {
            "status_role": "status{ selected(choose from status_options in partial_input), custom_status }, character_role_level{ selected(choose from role_options in partial_input), custom_character_role_level }",
            "appearance": "selected_visual_style(choose from visual_style_options in partial_input), appearance_details{ age_range, gender_presentation, height, body_type, silhouette_shape, face_shape, skin_tone_or_markings, hair_style, hair_color, eye_shape, eye_color, distinctive_features[], scars_or_birthmarks[], clothing_style, main_outfit_description, alternate_outfits[], accessories[], weapons_or_tools_visible[], iconic_item, color_palette[], visual_symbol_or_motif, expression_style, pose_language, manga_panel_presence, first_impression_visual, how_design_reflects_personality, how_design_reflects_backstory, how_design_reflects_power_or_role, ai_image_prompt_notes, negative_prompt_notes }",
            "faction": "selected(choose from faction_alignment_options in partial_input), custom_alignment_type, alignment_details{ linked_master_faction, character_role_in_faction, loyalty_level, reason_for_following_this_side, what_the_faction_wants_from_character, what_character_wants_from_faction, conflict_with_faction, can_change_sides, side_change_trigger, hidden_allegiance, public_allegiance }",
            "backstory": "selected_backstory_type(choose from backstory_type_options), selected_mental_state(choose from mental_state_options), selected_community_place(choose from community_place_options), backstory_details{ birthplace, family_situation, childhood_summary, important_past_event, past_trauma_or_wound, past_failure, past_success, secret_from_past, what_the_character_lost, what_the_character_gained, how_backstory_connects_to_master_world, how_backstory_connects_to_master_factions, how_backstory_connects_to_major_threat }, mental_state_details{ current_emotional_state, main_fear, main_desire, inner_need, outer_goal, biggest_strength, biggest_flaw, fatal_flaw, emotional_wound, coping_mechanism }, community_place_details{ community_name, social_class, public_reputation, how_people_treat_them, responsibilities_in_community, desired_new_status }",
            "personality": "selected_personality_types[](choose 2-5 from personality_type_options), personality_details{ core_traits[], positive_traits[], negative_traits[], public_personality, private_personality, true_self, behavior_when_safe, behavior_when_threatened, behavior_under_pressure, speech_style, humor_style, habit_or_quirk, biggest_personality_flaw, personality_contradiction, personality_change_arc }",
            "powers": "is_enabled(bool), selected_power_origin(choose from power_origin_options), selected_power_type(choose from power_type_options), selected_power_level(choose from power_level_options), power_details{ power_name, power_description, how_power_manifests, visual_style_when_used, main_abilities[], ultimate_ability, power_source, power_cost, power_limitations, weaknesses[], control_level, growth_potential, risk_to_user, how_power_connects_to_backstory, how_power_connects_to_faction, how_power_connects_to_major_threat }",
            "arc": "selected_arc_type(choose from arc_type_options), arc_details{ starting_belief, false_belief_or_lie, truth_they_must_learn, personal_goal, main_internal_conflict, main_external_conflict, what_forces_them_to_change, lowest_point, turning_point, final_state }, threat_connection_details{ linked_major_threat, why_character_cares_about_threat, how_major_threat_blocks_character_goal, how_character_can_damage_or_stop_threat, how_threat_can_break_character, personal_stakes_if_threat_wins, final_conflict_role }",
        },
        "side": {
            "status_role": "character_role_level{ selected(choose from role_options in partial_input), custom_character_role_level }, status{ selected(choose from status_options in partial_input), custom_status }",
            "appearance": "appearance_and_visual_design{ selected_visual_style(choose from visual_style_options), appearance_details{ age_range, gender_presentation, height, body_type, hair_style, hair_color, eye_color, clothing_style, main_outfit_description, ai_image_prompt_notes, negative_prompt_notes } }",
            "faction": "main_character_faction_alignment{ selected(choose from faction_alignment_options), custom_alignment_type, alignment_details{ linked_master_faction, character_role_in_faction, loyalty_level, reason_for_following_this_side } }",
            "backstory": "character_backstory_mental_state_and_community_place{ selected_backstory_type(choose from backstory_type_options), selected_mental_state(choose from mental_state_options), selected_community_place(choose from community_place_options), backstory_details{ birthplace, family_situation, childhood_summary, important_past_event, past_trauma_or_wound, how_backstory_connects_to_master_world }, mental_state_details{ main_fear, main_desire, biggest_flaw } }",
            "personality": "character_personality{ selected_personality_types[](choose 2-4 from personality_type_options), personality_details{ public_personality, speech_style, habit_or_quirk } }",
            "story_role": (
                "story_function(choose from story_function_options in partial_input), "
                "relationship_to_protagonist(text — their specific bond with the main character(s) by name), "
                "narrative_fate(choose from narrative_fate_options in partial_input), "
                "story_impact(1-2 sentences — the concrete effect this character has on the story or protagonist)"
            ),
            "auto_side_cast": (
                "array of fully-formed side character objects — one per distinct supporting character implied by the story. "
                "Generate as many as the story needs, no fixed count. "
                "DO NOT duplicate any existing major or side character names listed in the generation instructions. "
                "Each object must have ALL of these keys: "
                "character_name(string), "
                "status{ selected(one of: alive/dead/missing/unknown/sealed/exiled/transformed/revived/custom) }, "
                "character_role_level{ selected: 'Supporting Character' }, "
                "appearance_and_visual_design{ "
                "  selected_visual_style(one of: Warrior/Mage/Rogue/Healer/Merchant/Noble/Scholar/Villager/Guard/Priest/Elder/Rebel/Custom), "
                "  appearance_details{ age_range, gender_presentation, height, body_type, hair_style, hair_color, eye_color, "
                "    distinctive_features[], clothing_style, main_outfit_description, color_palette[], "
                "    ai_image_prompt_notes, negative_prompt_notes } "
                "}, "
                "main_character_faction_alignment{ "
                "  selected(one of: Neutral/Loyal/Rebel/Hidden/Conflicted/Mercenary/Custom), "
                "  alignment_details{ linked_master_faction, character_role_in_faction, loyalty_level, reason_for_following_this_side } "
                "}, "
                "character_backstory_mental_state_and_community_place{ "
                "  selected_backstory_type, selected_mental_state, selected_community_place, "
                "  backstory_details{ birthplace, family_situation, childhood_summary, important_past_event, "
                "    past_trauma_or_wound, how_backstory_connects_to_master_world, how_backstory_connects_to_master_factions }, "
                "  mental_state_details{ current_emotional_state, main_fear, main_desire, biggest_flaw, coping_mechanism }, "
                "  community_place_details{ community_name, social_class, public_reputation, responsibilities_in_community } "
                "}, "
                "character_personality{ "
                "  selected_personality_types[](pick 2-3), "
                "  personality_details{ core_traits[], public_personality, private_personality, speech_style, habit_or_quirk, biggest_personality_flaw } "
                "}, "
                "story_role{ "
                "  story_function(one of: mentor_guide/tragic_sacrifice/comic_relief/love_interest/rival_turned_ally/"
                "    informant/protective_figure/betrayer/catalyst/loyal_companion/obstacle/foil/villain_origin), "
                "  relationship_to_protagonist(text — name the specific major character(s) and the bond), "
                "  narrative_fate(one of: survives_story/dies_heroically/dies_tragically/betrays_protagonist/"
                "    redeemed/disappears/exiled/arrested/transforms/unknown), "
                "  story_impact(1-2 sentences — concrete effect on the story) "
                "}"
            ),
        },
        "board": {
            "arc_overview": "arc_title, arc_number(int), arc_type, arc_length_type(plain string, one of: One-Shot/Short Arc/Medium Arc/Long Arc/Saga/Season/Full Series/Custom), arc_summary, starting_status_quo, main_story_question, central_emotional_question, main_external_conflict, main_internal_conflict, main_relationship_conflict, main_threat_used, minor_threats_used[](use names from context), main_factions_used[](use names from context), main_characters_used[](use names from context), relationships_used[](use IDs from context), ending_type_target, custom_arc_overview_details",
            "chapters": "array of objects [{ chapter_id(use ch_NNN format like ch_001), chapter_number(int, sequential), arc_title(use arc_title from context to link chapter to its arc), chapter_title, chapter_purpose, structure_section(use one valid tag: ki_introduction/sho_development/ten_twist_or_turn/ketsu_conclusion/act_1_setup/act_2_escalation/act_3_climax_resolution/mystery_setup/clue_investigation/escalation_pressure/major_reveal/confrontation_payoff), summary, main_conflict, emotional_beat, twist_or_hook, ending_cliffhanger, characters_present[](string[] use character names from context), factions_used[](string[] use faction names from context), threats_used[](string[] use threat names from context), relationships_used[](string[] use relationship IDs from context), world_rules_shown[](string[]), power_system_shown[](string[]), custom_chapter_details }]",
            "structure": "For Kishotenketsu: kishotenketsu_outline{ ki_introduction{ initial_mystery_or_question, opening_image, chapter_range }, sho_development{ tension_growth, chapter_range }, ten_twist_or_turn{ main_twist, hidden_truth_revealed, major_threat_recontextualized, relationship_reversal, character_arc_turning_point, chapter_range }, ketsu_conclusion{ conflict_resolution, emotional_resolution, relationship_resolution, world_state_after_arc, character_final_state, chapter_range } }. For Three-Act/Hero's Journey: conflict_driven_outline{ act_1_setup{ opening_hook, normal_world, inciting_incident, first_major_choice, main_goal_locked, chapter_range }, act_2_escalation{ midpoint_reveal_or_defeat, stakes_increase, chapter_range }, act_3_climax_resolution{ darkest_moment, final_plan_or_breakthrough, climax_battle_or_confrontation, major_threat_outcome, character_arc_payoff, relationship_payoff, ending_image, chapter_range } }. For Mystery Arc, plan chapters using these structure_section tags in order: mystery_setup, clue_investigation, escalation_pressure, major_reveal, confrontation_payoff.",
        },
        "scenes": {
            "scenes_for_chapter": "array of objects [{ scene_id, chapter_id(use context chapter IDs), scene_order(int), location(MUST be the exact name string from context.locations[].name — pick whichever location fits this scene best; never invent a new name), time(one of: Dawn/Morning/Afternoon/Evening/Night/Midnight), characters_present[](use character names from context), scene_goal, scene_conflict, relationship_dynamic_used, new_information_revealed, action_or_dialogue_focus, visual_manga_moment, panel_mood, ending_beat, custom_scene_details }]",
            "scene_count_recommendations": "array of objects [{ chapter_id(use context chapter IDs), chapter_number(int), chapter_title, current_scene_count(int), recommended_scene_count(int between 1 and 8), reason, must_cover_beats[](array of objects, each: { beat(string — what happens in this scene), location(exact name from context.locations[].name — pick the most fitting location for this beat), time(one of: Dawn/Morning/Afternoon/Evening/Night/Midnight) }) }]",
        },
        "threads": {
            "main": "goal, obstacles[](string[]), turning_points[](string[]), resolution",
            "character_arcs": "array [{ character_id(use IDs from context), starting_state, growth_beats[](string[]), lowest_point, final_state }]",
            "relationships": "array [{ relationship_id(use IDs from context), start_dynamic, change_beats[](string[]), breaking_point, final_dynamic }]",
            "threats": "array [{ threat_id_or_name(use names from context), first_hint, escalation_beats[](string[]), reveal, final_outcome }]",
            "powers": "array [{ character_id(use IDs from context), power_name, first_use, training_or_failure_beats[](string[]), breakthrough, cost_or_consequence }]",
        },
        "world": {
            "world_core_details": (
                "object with optional custom_world_type, custom_rules, custom_factions, custom_threats, "
                "rule_details{ magic_rules, power_rules, demon_rules, monster_rules, god_rules, technology_rules, "
                "race_species_rules, realm_dimension_rules, forbidden_rules, power_limits, custom_rule_details }, "
                "faction_details keyed by selected faction slug, each { main_ruling_side, opposing_side, neutral_side, hidden_side, ruling_side_details, conflict_map }, "
                "threat_details{ main_threat_source, main_threat_goal, main_threat_target, stakes_if_major_threat_wins, time_limit, hidden_truth_behind_threat }. "
                "Only fill fields relevant to the user's selected options in partial_input. Do not change selections."
            ),
        },
        "locations": {
            "name": "evocative location name that fits the story world and genre",
            "type": "location category (e.g. Interior/Residential, Exterior/Urban, Forest, Dungeon, Market, School, Rooftop, Underground)",
            "description": "rich visual description: lighting mood, dominant colors, textures, atmosphere, key props, time of day feel, story significance",
            "positive_prompt": "SHORT comma-separated list of what is drawn in this place — environment type, key structural / architectural / natural details, props, light-vs-shadow words (e.g. 'deep shadows', 'high contrast'). " + STYLE_INSTRUCTION,
            "negative_prompt": "comma-separated exclusion terms, e.g.: people, characters, text, watermark, blurry, low quality, nsfw",
            "locations": (
                "array of 5-8 location objects covering key story settings — each: "
                "{ name, type, description(visual prose), "
                "positive_prompt(SHORT comma-separated list of drawn details — environment, structure, props, light/shadow words; no colour names, no 'cinematic'/'atmospheric', no style word), "
                "negative_prompt(short exclusion list) }. "
                "Base locations on chapters, world rules, factions, and character home/work places from context. "
                "Avoid duplicating any locations already in context.locations[]."
            ),
        },
    }
    page_schema = schemas.get(page, {})
    matched: list[str] = []
    for tf in target_fields:
        if tf in page_schema:
            matched.append(f"  - {tf}: {page_schema[tf]}")
    if not matched:
        return ""
    return "\nREQUIRED sub-fields — fill EVERY one of these for each target field. Do not omit any:\n" + "\n".join(matched)

