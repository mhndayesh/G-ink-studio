type AnyRecord = Record<string, any>;

function isRecord(value: any): value is AnyRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pick(source: AnyRecord, keys: string[]): AnyRecord {
  const out: AnyRecord = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function hasKeys(value: AnyRecord): boolean {
  return Object.keys(value).length > 0;
}

function selection(value: any): AnyRecord {
  if (typeof value === "string") return { selected: value };
  if (isRecord(value)) return value;
  return {};
}

const APPEARANCE_DETAIL_KEYS = [
  "age_range", "gender_presentation", "height", "body_type", "silhouette_shape",
  "face_shape", "skin_tone_or_markings", "hair_style", "hair_color", "eye_shape",
  "eye_color", "distinctive_features", "scars_or_birthmarks", "clothing_style",
  "main_outfit_description", "alternate_outfits", "accessories", "weapons_or_tools_visible",
  "iconic_item", "color_palette", "visual_symbol_or_motif", "visual_contrast_with_other_characters",
  "expression_style", "pose_language", "manga_panel_presence", "first_impression_visual",
  "how_design_reflects_personality", "how_design_reflects_backstory",
  "how_design_reflects_power_or_role", "ai_image_prompt_notes", "negative_prompt_notes",
  "custom_visual_design_details",
];

const ALIGNMENT_DETAIL_KEYS = [
  "linked_master_faction", "linked_custom_master_faction", "character_specific_faction_name",
  "character_specific_faction_type", "character_specific_group_members", "character_role_in_faction",
  "loyalty_level", "reason_for_following_this_side", "what_the_faction_wants_from_character",
  "what_character_wants_from_faction", "conflict_with_faction", "can_change_sides",
  "side_change_trigger", "hidden_allegiance", "public_allegiance", "custom_alignment_details",
];

const BACKSTORY_DETAIL_KEYS = [
  "birthplace", "family_situation", "parent_or_guardian_status", "childhood_summary",
  "important_past_event", "past_trauma_or_wound", "past_failure", "past_success",
  "secret_from_past", "what_the_character_lost", "what_the_character_gained",
  "who_helped_them_before_story", "who_hurt_them_before_story",
  "how_backstory_connects_to_master_world", "how_backstory_connects_to_master_factions",
  "how_backstory_connects_to_major_threat", "custom_backstory_details",
];

const MENTAL_STATE_DETAIL_KEYS = [
  "current_emotional_state", "main_fear", "main_desire", "inner_need", "outer_goal",
  "biggest_strength", "biggest_flaw", "fatal_flaw", "emotional_wound", "coping_mechanism",
  "trigger_points", "trust_level", "anger_level", "confidence_level", "self_control_level",
  "risk_tolerance", "how_they_handle_conflict", "how_they_handle_loss",
  "how_they_handle_power", "custom_mental_state_details",
];

const COMMUNITY_PLACE_DETAIL_KEYS = [
  "community_name", "social_class", "public_reputation", "private_reputation",
  "how_people_treat_them", "who_respects_them", "who_hates_them", "who_protects_them",
  "who_uses_them", "responsibilities_in_community", "rights_or_privileges",
  "restrictions_or_limits", "community_expectations", "reason_for_current_status",
  "does_character_want_to_change_status", "desired_new_status", "custom_community_place_details",
];

const PERSONALITY_DETAIL_KEYS = [
  "core_traits", "positive_traits", "negative_traits", "public_personality",
  "private_personality", "personality_mask", "true_self", "behavior_when_safe",
  "behavior_when_threatened", "behavior_under_pressure", "speech_style", "humor_style",
  "intelligence_style", "social_style", "leadership_style", "morality_style",
  "decision_making_style", "conflict_style", "relationship_style", "trust_style",
  "habit_or_quirk", "pet_peeves", "likes", "dislikes", "biggest_personality_flaw",
  "personality_contradiction", "how_personality_connects_to_backstory",
  "how_personality_affects_faction_alignment", "how_personality_affects_main_goal",
  "personality_change_arc", "custom_personality_details",
];

const POWER_DETAIL_KEYS = [
  "power_name", "power_description", "how_power_manifests", "visual_style_when_used",
  "main_abilities", "secondary_abilities", "passive_abilities", "ultimate_ability",
  "power_source", "power_cost", "power_limitations", "weaknesses", "forbidden_use",
  "training_needed", "control_level", "current_mastery_level", "growth_potential",
  "risk_to_user", "risk_to_others", "how_power_connects_to_backstory",
  "how_power_connects_to_faction", "how_power_connects_to_major_threat",
  "does_character_hide_power", "why_power_is_hidden", "is_power_rare_in_world",
  "who_else_has_similar_power", "custom_power_details",
];

const ARC_DETAIL_KEYS = [
  "starting_belief", "false_belief_or_lie", "truth_they_must_learn", "personal_goal",
  "inner_need", "outer_goal", "main_internal_conflict", "main_external_conflict",
  "what_forces_them_to_change", "lowest_point", "turning_point", "final_state",
  "custom_arc_details",
];

const THREAT_CONNECTION_DETAIL_KEYS = [
  "linked_major_threat", "linked_minor_threats", "why_character_cares_about_threat",
  "how_personal_goal_clashes_with_major_threat", "how_major_threat_blocks_character_goal",
  "how_character_can_damage_or_stop_threat", "how_threat_can_break_character",
  "personal_stakes_if_threat_wins", "community_stakes_if_threat_wins",
  "faction_stakes_if_threat_wins", "world_stakes_if_threat_wins", "final_conflict_role",
  "custom_threat_connection_details",
];

function mapStatusRole(v: AnyRecord): AnyRecord {
  const mapped: AnyRecord = {};
  if (v.status !== undefined) mapped.status = selection(v.status);
  if (v.character_role_level !== undefined) mapped.character_role_level = selection(v.character_role_level);
  if (v.custom_status !== undefined) mapped.status = { ...(mapped.status || {}), custom_status: v.custom_status };
  if (v.custom_character_role_level !== undefined) {
    mapped.character_role_level = { ...(mapped.character_role_level || {}), custom_character_role_level: v.custom_character_role_level };
  }
  return mapped;
}

function mapAppearance(v: AnyRecord): AnyRecord {
  const raw = isRecord(v.appearance_and_visual_design) ? { ...v.appearance_and_visual_design } : {};
  const directDetails = pick(v, APPEARANCE_DETAIL_KEYS);
  const nestedDetails = isRecord(v.appearance_details) ? pick(v.appearance_details, APPEARANCE_DETAIL_KEYS) : {};
  const details = { ...(isRecord(raw.appearance_details) ? raw.appearance_details : {}), ...directDetails, ...nestedDetails };

  if (v.selected_visual_style !== undefined) raw.selected_visual_style = v.selected_visual_style;
  if (v.visual_style !== undefined && raw.selected_visual_style === undefined) raw.selected_visual_style = v.visual_style;
  if (v.custom_visual_style !== undefined) raw.custom_visual_style = v.custom_visual_style;
  if (hasKeys(details)) raw.appearance_details = details;
  return hasKeys(raw) ? { appearance_and_visual_design: raw } : {};
}

function mapFaction(v: AnyRecord): AnyRecord {
  const raw = isRecord(v.main_character_faction_alignment) ? { ...v.main_character_faction_alignment } : {};
  const directDetails = pick(v, ALIGNMENT_DETAIL_KEYS);
  const nestedDetails = isRecord(v.alignment_details) ? pick(v.alignment_details, ALIGNMENT_DETAIL_KEYS) : {};
  const details = { ...(isRecord(raw.alignment_details) ? raw.alignment_details : {}), ...directDetails, ...nestedDetails };

  if (v.selected !== undefined) raw.selected = v.selected;
  if (v.selected_alignment_type !== undefined && raw.selected === undefined) raw.selected = v.selected_alignment_type;
  if (v.alignment_type !== undefined && raw.selected === undefined) raw.selected = v.alignment_type;
  if (v.custom_alignment_type !== undefined) raw.custom_alignment_type = v.custom_alignment_type;
  if (hasKeys(details)) raw.alignment_details = details;
  return hasKeys(raw) ? { main_character_faction_alignment: raw } : {};
}

function mapBackstory(v: AnyRecord): AnyRecord {
  const raw = isRecord(v.character_backstory_mental_state_and_community_place)
    ? { ...v.character_backstory_mental_state_and_community_place }
    : {};
  const backstorySrc = isRecord(v.backstory) ? v.backstory : {};
  const mentalSrc = isRecord(v.mental_state) ? v.mental_state : {};
  const communitySrc = isRecord(v.community_place) ? v.community_place : {};
  const backstoryDetails = {
    ...(isRecord(raw.backstory_details) ? raw.backstory_details : {}),
    ...pick(v, BACKSTORY_DETAIL_KEYS),
    ...pick(backstorySrc, BACKSTORY_DETAIL_KEYS),
    ...(isRecord(v.backstory_details) ? pick(v.backstory_details, BACKSTORY_DETAIL_KEYS) : {}),
  };
  const mentalDetails = {
    ...(isRecord(raw.mental_state_details) ? raw.mental_state_details : {}),
    ...pick(v, MENTAL_STATE_DETAIL_KEYS),
    ...pick(mentalSrc, MENTAL_STATE_DETAIL_KEYS),
    ...(isRecord(v.mental_state_details) ? pick(v.mental_state_details, MENTAL_STATE_DETAIL_KEYS) : {}),
  };
  const communityDetails = {
    ...(isRecord(raw.community_place_details) ? raw.community_place_details : {}),
    ...pick(v, COMMUNITY_PLACE_DETAIL_KEYS),
    ...pick(communitySrc, COMMUNITY_PLACE_DETAIL_KEYS),
    ...(isRecord(v.community_place_details) ? pick(v.community_place_details, COMMUNITY_PLACE_DETAIL_KEYS) : {}),
  };

  if (v.selected_backstory_type !== undefined) raw.selected_backstory_type = v.selected_backstory_type;
  if (backstorySrc.selected_backstory_type !== undefined) raw.selected_backstory_type = backstorySrc.selected_backstory_type;
  if (v.selected_mental_state !== undefined) raw.selected_mental_state = v.selected_mental_state;
  if (mentalSrc.selected_mental_state !== undefined) raw.selected_mental_state = mentalSrc.selected_mental_state;
  if (v.selected_community_place !== undefined) raw.selected_community_place = v.selected_community_place;
  if (communitySrc.selected_community_place !== undefined) raw.selected_community_place = communitySrc.selected_community_place;
  if (v.custom_backstory_type !== undefined) raw.custom_backstory_type = v.custom_backstory_type;
  if (v.custom_mental_state !== undefined) raw.custom_mental_state = v.custom_mental_state;
  if (v.custom_community_place !== undefined) raw.custom_community_place = v.custom_community_place;
  if (hasKeys(backstoryDetails)) raw.backstory_details = backstoryDetails;
  if (hasKeys(mentalDetails)) raw.mental_state_details = mentalDetails;
  if (hasKeys(communityDetails)) raw.community_place_details = communityDetails;
  return hasKeys(raw) ? { character_backstory_mental_state_and_community_place: raw } : {};
}

function mapPersonality(v: AnyRecord): AnyRecord {
  const raw = isRecord(v.character_personality) ? { ...v.character_personality } : {};
  const directDetails = pick(v, PERSONALITY_DETAIL_KEYS);
  const nestedDetails = isRecord(v.personality_details) ? pick(v.personality_details, PERSONALITY_DETAIL_KEYS) : {};
  const details = { ...(isRecord(raw.personality_details) ? raw.personality_details : {}), ...directDetails, ...nestedDetails };

  if (v.selected_personality_types !== undefined) raw.selected_personality_types = v.selected_personality_types;
  if (v.custom_personality_type !== undefined) raw.custom_personality_type = v.custom_personality_type;
  if (hasKeys(details)) raw.personality_details = details;
  return hasKeys(raw) ? { character_personality: raw } : {};
}

function mapPowers(v: AnyRecord): AnyRecord {
  const raw = isRecord(v.optional_powers_and_power_level) ? { ...v.optional_powers_and_power_level } : {};
  const directDetails = pick(v, POWER_DETAIL_KEYS);
  const nestedDetails = isRecord(v.power_details) ? pick(v.power_details, POWER_DETAIL_KEYS) : {};
  const details = { ...(isRecord(raw.power_details) ? raw.power_details : {}), ...directDetails, ...nestedDetails };

  for (const key of ["is_enabled", "reason_if_disabled", "selected_power_origin", "selected_power_type", "selected_power_level", "custom_power_origin", "custom_power_type", "custom_power_level"]) {
    if (v[key] !== undefined) raw[key] = v[key];
  }
  if (hasKeys(details)) raw.power_details = details;
  return hasKeys(raw) ? { optional_powers_and_power_level: raw } : {};
}

function mapArc(v: AnyRecord): AnyRecord {
  const raw = isRecord(v.character_arc_and_threat_connection) ? { ...v.character_arc_and_threat_connection } : {};
  const arcSrc = isRecord(v.arc_details) ? v.arc_details : {};
  const threatSrc = isRecord(v.threat_connection) ? v.threat_connection : {};
  const threatDetailsSrc = isRecord(v.threat_connection_details) ? v.threat_connection_details : {};
  const arcDetails = {
    ...(isRecord(raw.arc_details) ? raw.arc_details : {}),
    ...pick(v, ARC_DETAIL_KEYS),
    ...pick(arcSrc, ARC_DETAIL_KEYS),
  };
  const threatDetails = {
    ...(isRecord(raw.threat_connection_details) ? raw.threat_connection_details : {}),
    ...pick(v, THREAT_CONNECTION_DETAIL_KEYS),
    ...pick(threatSrc, THREAT_CONNECTION_DETAIL_KEYS),
    ...pick(threatDetailsSrc, THREAT_CONNECTION_DETAIL_KEYS),
  };

  if (v.selected_arc_type !== undefined) raw.selected_arc_type = v.selected_arc_type;
  if (arcSrc.selected_arc_type !== undefined) raw.selected_arc_type = arcSrc.selected_arc_type;
  if (v.custom_arc_type !== undefined) raw.custom_arc_type = v.custom_arc_type;
  if (arcSrc.custom_arc_type !== undefined) raw.custom_arc_type = arcSrc.custom_arc_type;
  if (hasKeys(arcDetails)) raw.arc_details = arcDetails;
  if (hasKeys(threatDetails)) raw.threat_connection_details = threatDetails;
  return hasKeys(raw) ? { character_arc_and_threat_connection: raw } : {};
}

export function mapCharacterAiToProfileData(gen: AnyRecord, includeMajorOnlyFields = true): AnyRecord {
  const mapped: AnyRecord = {};
  for (const [key, val] of Object.entries(gen || {})) {
    if (!isRecord(val)) {
      mapped[key] = val;
      continue;
    }
    if (key === "status_role") Object.assign(mapped, mapStatusRole(val));
    else if (key === "appearance") Object.assign(mapped, mapAppearance(val));
    else if (key === "faction") Object.assign(mapped, mapFaction(val));
    else if (key === "backstory") Object.assign(mapped, mapBackstory(val));
    else if (key === "personality") Object.assign(mapped, mapPersonality(val));
    else if (includeMajorOnlyFields && key === "powers") Object.assign(mapped, mapPowers(val));
    else if (includeMajorOnlyFields && key === "arc") Object.assign(mapped, mapArc(val));
    else mapped[key] = val;
  }
  return mapped;
}

export function normalizeCharacterProfileForEditor(profile: AnyRecord, includeMajorOnlyFields = true): AnyRecord {
  const clone = JSON.parse(JSON.stringify(profile || {}));
  const mapped = mapCharacterAiToProfileData(clone, includeMajorOnlyFields);
  for (const key of ["status_role", "appearance", "faction", "backstory", "personality", "powers", "arc"]) {
    delete clone[key];
  }
  return { ...clone, ...mapped };
}
