"use client";

import { useEffect, useState } from "react";
import { Field } from "./Field";
import { OptionGrid } from "./OptionGrid";
import { CustomInput } from "./CustomInput";
import { normalizeCharacterProfileForEditor } from "@/lib/profileAiMapping";

type ProfileData = Record<string, any>;

const TABS = [
  { key: "status_role", label: "Status & Role" },
  { key: "appearance", label: "Appearance" },
  { key: "faction", label: "Faction" },
  { key: "backstory", label: "Backstory" },
  { key: "personality", label: "Personality" },
  { key: "powers", label: "Powers" },
  { key: "arc", label: "Arc & Threats" },
];

function newProfileData(): ProfileData {
  return {
    status: { selected: "alive", custom_status: "" },
    character_role_level: { selected: "", custom_character_role_level: "" },
    appearance_and_visual_design: {
      selected_visual_style: "",
      custom_visual_style: "",
      appearance_details: {
        age_range: "", gender_presentation: "", height: "", body_type: "", silhouette_shape: "",
        face_shape: "", skin_tone_or_markings: "", hair_style: "", hair_color: "", eye_shape: "",
        eye_color: "", distinctive_features: [], scars_or_birthmarks: [], clothing_style: "",
        main_outfit_description: "", alternate_outfits: [], accessories: [], weapons_or_tools_visible: [],
        iconic_item: "", color_palette: [], visual_symbol_or_motif: "", visual_contrast_with_other_characters: "",
        expression_style: "", pose_language: "", manga_panel_presence: "", first_impression_visual: "",
        how_design_reflects_personality: "", how_design_reflects_backstory: "",
        how_design_reflects_power_or_role: "", ai_image_prompt_notes: "", negative_prompt_notes: "",
        custom_visual_design_details: "",
      },
    },
    main_character_faction_alignment: {
      selected: "", custom_alignment_type: "",
      alignment_details: {
        linked_master_faction: "", linked_custom_master_faction: "", character_specific_faction_name: "",
        character_specific_faction_type: "", character_specific_group_members: [], character_role_in_faction: "",
        loyalty_level: "", reason_for_following_this_side: "", what_the_faction_wants_from_character: "",
        what_character_wants_from_faction: "", conflict_with_faction: "", can_change_sides: false,
        side_change_trigger: "", hidden_allegiance: "", public_allegiance: "", custom_alignment_details: "",
      },
    },
    character_backstory_mental_state_and_community_place: {
      selected_backstory_type: "", selected_mental_state: "", selected_community_place: "",
      custom_backstory_type: "", custom_mental_state: "", custom_community_place: "",
      backstory_details: {
        birthplace: "", family_situation: "", parent_or_guardian_status: "", childhood_summary: "",
        important_past_event: "", past_trauma_or_wound: "", past_failure: "", past_success: "",
        secret_from_past: "", what_the_character_lost: "", what_the_character_gained: "",
        who_helped_them_before_story: "", who_hurt_them_before_story: "",
        how_backstory_connects_to_master_world: "", how_backstory_connects_to_master_factions: "",
        how_backstory_connects_to_major_threat: "", custom_backstory_details: "",
      },
      mental_state_details: {
        current_emotional_state: "", main_fear: "", main_desire: "", inner_need: "", outer_goal: "",
        biggest_strength: "", biggest_flaw: "", fatal_flaw: "", emotional_wound: "", coping_mechanism: "",
        trigger_points: [], trust_level: "", anger_level: "", confidence_level: "", self_control_level: "",
        risk_tolerance: "", how_they_handle_conflict: "", how_they_handle_loss: "", how_they_handle_power: "",
        custom_mental_state_details: "",
      },
      community_place_details: {
        community_name: "", social_class: "", public_reputation: "", private_reputation: "",
        how_people_treat_them: "", who_respects_them: [], who_hates_them: [], who_protects_them: [],
        who_uses_them: [], responsibilities_in_community: "", rights_or_privileges: "",
        restrictions_or_limits: "", community_expectations: "", reason_for_current_status: "",
        does_character_want_to_change_status: false, desired_new_status: "", custom_community_place_details: "",
      },
    },
    character_personality: {
      selected_personality_types: [], custom_personality_type: "",
      personality_details: {
        core_traits: [], positive_traits: [], negative_traits: [], public_personality: "",
        private_personality: "", personality_mask: "", true_self: "", behavior_when_safe: "",
        behavior_when_threatened: "", behavior_under_pressure: "", speech_style: "", humor_style: "",
        intelligence_style: "", social_style: "", leadership_style: "", morality_style: "",
        decision_making_style: "", conflict_style: "", relationship_style: "", trust_style: "",
        habit_or_quirk: "", pet_peeves: [], likes: [], dislikes: [], biggest_personality_flaw: "",
        personality_contradiction: "", how_personality_connects_to_backstory: "",
        how_personality_affects_faction_alignment: "", how_personality_affects_main_goal: "",
        personality_change_arc: "", custom_personality_details: "",
      },
    },
    optional_powers_and_power_level: {
      is_enabled: false, reason_if_disabled: "",
      selected_power_origin: "", selected_power_type: "", selected_power_level: "",
      custom_power_origin: "", custom_power_type: "", custom_power_level: "",
      power_details: {
        power_name: "", power_description: "", how_power_manifests: "", visual_style_when_used: "",
        main_abilities: [], secondary_abilities: [], passive_abilities: [], ultimate_ability: "",
        power_source: "", power_cost: "", power_limitations: "", weaknesses: [], forbidden_use: "",
        training_needed: "", control_level: "", current_mastery_level: "", growth_potential: "",
        risk_to_user: "", risk_to_others: "", how_power_connects_to_backstory: "",
        how_power_connects_to_faction: "", how_power_connects_to_major_threat: "",
        does_character_hide_power: false, why_power_is_hidden: "", is_power_rare_in_world: false,
        who_else_has_similar_power: [], custom_power_details: "",
      },
    },
    character_arc_and_threat_connection: {
      selected_arc_type: "", custom_arc_type: "",
      arc_details: {
        starting_belief: "", false_belief_or_lie: "", truth_they_must_learn: "", personal_goal: "",
        inner_need: "", outer_goal: "", main_internal_conflict: "", main_external_conflict: "",
        what_forces_them_to_change: "", lowest_point: "", turning_point: "", final_state: "", custom_arc_details: "",
      },
      threat_connection_details: {
        linked_major_threat: "", linked_minor_threats: [],
        why_character_cares_about_threat: "", how_personal_goal_clashes_with_major_threat: "",
        how_major_threat_blocks_character_goal: "", how_character_can_damage_or_stop_threat: "",
        how_threat_can_break_character: "", personal_stakes_if_threat_wins: "",
        community_stakes_if_threat_wins: "", faction_stakes_if_threat_wins: "",
        world_stakes_if_threat_wins: "", final_conflict_role: "", custom_threat_connection_details: "",
      },
    },
  };
}

function updateNested(data: ProfileData, path: string[], value: any): ProfileData {
  const clone = JSON.parse(JSON.stringify(data));
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]];
  cur[path[path.length - 1]] = value;
  return clone;
}

function deepMergeProfile(base: ProfileData, updates: ProfileData): ProfileData {
  const out = JSON.parse(JSON.stringify(base || {}));
  for (const [key, value] of Object.entries(updates || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
      out[key] = deepMergeProfile(out[key], value as ProfileData);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function profileFromInitial(initialData?: ProfileData | null): ProfileData {
  if (!initialData || Object.keys(initialData).length === 0) return newProfileData();
  return deepMergeProfile(newProfileData(), normalizeCharacterProfileForEditor(initialData, true));
}

export const PROFILE_OPTS = {
  STATUS_OPTS: ["alive", "dead", "missing", "unknown", "sealed", "exiled", "transformed", "revived", "custom"],
  ROLE_OPTS: ["Primary Main Character", "Second Main Character", "Co-Protagonist", "Major Team Member", "Major Family Member", "Major Faction Member", "Major POV Character", "Mentor Lead", "Student Lead", "Rival Lead", "Hidden Main Character", "Entity Representative", "Custom"],
  VISUAL_STYLE_OPTS: ["Cute / Soft", "Cool / Stylish", "Dark / Gothic", "Elegant / Noble", "Rough / Street", "School Uniform Style", "Battle Shonen Style", "Fantasy Warrior Style", "Royal / Noble Style", "Monster-Like Style", "Demonic Style", "Divine / Holy Style", "Sci-Fi / Cyberpunk Style", "Minimalist Style", "Comedic / Exaggerated Style", "Mysterious / Hidden Face Style", "Custom"],
  FACTION_ALIGN_OPTS: ["Follows Main Ruling Side", "Follows Opposing Side", "Follows Neutral Side", "Follows Hidden Side", "Belongs To Master Faction", "Belongs To Custom Master Faction", "Independent / Free Character", "No Faction", "Outsider To All Factions", "Secretly Loyal To A Faction", "Forced To Serve A Faction", "Born Into A Faction", "Raised By A Faction", "Protected By A Faction", "Hunted By A Faction", "Betrayed Their Faction", "Changes Sides Later", "Double Agent", "Creates Own Faction", "Leads Own Group", "Faction-Based Main Entity", "Custom"],
  BACKSTORY_OPTS: ["Normal Childhood", "Orphaned", "Abandoned", "Adopted", "Raised By Family", "Raised By Strangers", "Raised By Enemy Faction", "Raised By Secret Organization", "Noble / Royal Background", "Poor / Struggling Background", "Commoner Background", "Exiled Background", "Slave / Captive Background", "Survivor Of Disaster", "Survivor Of War", "Survivor Of Demon Attack", "Survivor Of Monster Attack", "Cursed Since Birth", "Blessed Since Birth", "Hidden Bloodline", "Lost Heir", "Former Villain", "Former Soldier", "Former Criminal", "Former Test Subject", "Failed Student", "Chosen One Past", "Fake Identity", "Memory Loss", "Secret Past", "Custom"],
  MENTAL_STATE_OPTS: ["Stable", "Calm But Guarded", "Happy Outside / Broken Inside", "Angry", "Fearful", "Lonely", "Guilt-Ridden", "Revenge-Driven", "Hopeful", "Confused", "Emotionally Numb", "Traumatized", "Paranoid", "Obsessive", "Depressed", "Anxious", "Overconfident", "Insecure", "Cold / Detached", "Kind But Weak-Willed", "Strong-Willed", "Mentally Unstable", "Split Between Good And Evil", "Hiding Pain With Humor", "Custom"],
  COMMUNITY_OPTS: ["High-Level / Elite", "Low-Level / Bottom Class", "Normal / Common", "Middle-Class", "Outcast", "Respected", "Feared", "Ignored", "Bullied", "Protected", "Used By Others", "Leader", "Future Leader", "Servant", "Student", "Worker", "Soldier", "Criminal", "Noble", "Royal", "Peasant", "Slave / Captive", "Foreigner / Outsider", "Refugee", "Hidden Important Person", "Secret Heir", "Religious Figure", "Clan Member", "Clan Failure", "Clan Hope", "Community Hero", "Community Shame", "Unknown / No Status", "Custom"],
  PERSONALITY_OPTS: ["Funny", "Smart", "Dumb / Naive", "Grumpy", "Brave", "Cowardly", "Kind", "Cruel", "Calm", "Hot-Headed", "Optimistic", "Pessimistic", "Sarcastic", "Serious", "Lazy", "Hardworking", "Loyal", "Selfish", "Charismatic", "Awkward", "Curious", "Secretive", "Honest", "Liar", "Stubborn", "Gentle", "Cold", "Chaotic", "Disciplined", "Introverted", "Extroverted", "Ambitious", "Humble", "Prideful", "Manipulative", "Innocent", "Cynical", "Rebellious", "Protective", "Custom"],
  POWER_ORIGIN_OPTS: ["Born With Power", "Trained Power", "Inherited Bloodline", "Divine Gift", "Demonic Power", "Spirit Contract", "Curse-Based Power", "Artifact / Relic-Based Power", "Technology-Based Power", "Experiment-Based Power", "Soul-Based Power", "Magic Study", "Forbidden Knowledge", "Transformation-Based Power", "Summoning-Based Power", "Stolen Power", "Borrowed Power", "Awakened Later", "Unknown Origin", "No Power Yet", "Custom"],
  POWER_TYPE_OPTS: ["Magic", "Super Strength", "Super Speed", "Enhanced Senses", "Element Control", "Fire", "Water", "Ice", "Lightning", "Wind", "Earth", "Light", "Darkness", "Healing", "Barrier / Shield", "Telekinesis", "Telepathy", "Illusion", "Mind Control", "Time Ability", "Space Ability", "Gravity Ability", "Reality Bending", "Soul Ability", "Bloodline Ability", "Curse Ability", "Demon Ability", "Divine Ability", "Spirit Ability", "Beast / Monster Ability", "Transformation", "Summoning", "Weapon-Based Power", "Artifact-Based Power", "Technology / Cybernetic Ability", "Energy Projection", "Flight", "Regeneration", "Copy Ability", "Sealing Ability", "Forbidden Ability", "No Power", "Custom"],
  POWER_LEVEL_OPTS: ["No Power", "Unknown Level", "Very Weak", "Weak", "Below Average", "Average", "Above Average", "Strong", "Very Strong", "Elite", "Hero Level", "Captain / Commander Level", "Royal / Noble Level", "Monster Level", "Demon Level", "Divine Level", "Country Level", "World Level", "Planet Level", "Dimension Level", "Multiverse Level", "Broken / Overpowered", "Sealed Power", "Hidden Potential", "Custom"],
  ARC_OPTS: ["Positive Change Arc", "Negative Change Arc", "Flat Arc", "Corruption Arc", "Redemption Arc", "Revenge Arc", "Coming Of Age Arc", "Healing Arc", "Fall From Grace Arc", "Rise To Leadership Arc", "Power Awakening Arc", "Identity Discovery Arc", "Freedom Arc", "Survival Arc", "Sacrifice Arc", "Tragic Hero Arc", "Villain Origin Arc", "Antihero Softening Arc", "Broken To Whole Arc", "Naive To Mature Arc", "Coward To Brave Arc", "Selfish To Selfless Arc", "Weak To Strong Arc", "Outcast To Belonging Arc", "Custom"],
};

export function ProfileTabs({
  onDataChange,
  initialData,
  resetKey,
}: {
  onDataChange: (data: ProfileData) => void;
  initialData?: ProfileData | null;
  resetKey?: string | number;
}) {
  const [activeTab, setActiveTab] = useState("status_role");
  const [data, setData] = useState<ProfileData>(() => profileFromInitial(initialData));

  useEffect(() => {
    setData(profileFromInitial(initialData));
    // Reset only when the parent explicitly changes resetKey; initialData also
    // changes on every keystroke echo and should not rewind the active edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  function upd(path: string[], value: any) {
    const next = updateNested(data, path, value);
    setData(next);
    onDataChange(next);
  }

  function updStr(path: string[]) { return (v: string) => upd(path, v); }
  function updBool(path: string[]) { return (v: boolean) => upd(path, v); }
  function toggleArr(path: string[], value: string) {
    const arr: string[] = path.reduce((o, k) => o[k], data as any) || [];
    upd(path, arr.includes(value) ? arr.filter((x: string) => x !== value) : [...arr, value]);
  }

  const STATUS_OPTS = ["alive", "dead", "missing", "unknown", "sealed", "exiled", "transformed", "revived", "custom"];
  const ROLE_OPTS = ["Primary Main Character", "Second Main Character", "Co-Protagonist", "Major Team Member", "Major Family Member", "Major Faction Member", "Major POV Character", "Mentor Lead", "Student Lead", "Rival Lead", "Hidden Main Character", "Entity Representative", "Custom"];
  const VISUAL_STYLE_OPTS = ["Cute / Soft", "Cool / Stylish", "Dark / Gothic", "Elegant / Noble", "Rough / Street", "School Uniform Style", "Battle Shonen Style", "Fantasy Warrior Style", "Royal / Noble Style", "Monster-Like Style", "Demonic Style", "Divine / Holy Style", "Sci-Fi / Cyberpunk Style", "Minimalist Style", "Comedic / Exaggerated Style", "Mysterious / Hidden Face Style", "Custom"];
  const FACTION_ALIGN_OPTS = ["Follows Main Ruling Side", "Follows Opposing Side", "Follows Neutral Side", "Follows Hidden Side", "Belongs To Master Faction", "Belongs To Custom Master Faction", "Independent / Free Character", "No Faction", "Outsider To All Factions", "Secretly Loyal To A Faction", "Forced To Serve A Faction", "Born Into A Faction", "Raised By A Faction", "Protected By A Faction", "Hunted By A Faction", "Betrayed Their Faction", "Changes Sides Later", "Double Agent", "Creates Own Faction", "Leads Own Group", "Faction-Based Main Entity", "Custom"];
  const BACKSTORY_OPTS = ["Normal Childhood", "Orphaned", "Abandoned", "Adopted", "Raised By Family", "Raised By Strangers", "Raised By Enemy Faction", "Raised By Secret Organization", "Noble / Royal Background", "Poor / Struggling Background", "Commoner Background", "Exiled Background", "Slave / Captive Background", "Survivor Of Disaster", "Survivor Of War", "Survivor Of Demon Attack", "Survivor Of Monster Attack", "Cursed Since Birth", "Blessed Since Birth", "Hidden Bloodline", "Lost Heir", "Former Villain", "Former Soldier", "Former Criminal", "Former Test Subject", "Failed Student", "Chosen One Past", "Fake Identity", "Memory Loss", "Secret Past", "Custom"];
  const MENTAL_STATE_OPTS = ["Stable", "Calm But Guarded", "Happy Outside / Broken Inside", "Angry", "Fearful", "Lonely", "Guilt-Ridden", "Revenge-Driven", "Hopeful", "Confused", "Emotionally Numb", "Traumatized", "Paranoid", "Obsessive", "Depressed", "Anxious", "Overconfident", "Insecure", "Cold / Detached", "Kind But Weak-Willed", "Strong-Willed", "Mentally Unstable", "Split Between Good And Evil", "Hiding Pain With Humor", "Custom"];
  const COMMUNITY_OPTS = ["High-Level / Elite", "Low-Level / Bottom Class", "Normal / Common", "Middle-Class", "Outcast", "Respected", "Feared", "Ignored", "Bullied", "Protected", "Used By Others", "Leader", "Future Leader", "Servant", "Student", "Worker", "Soldier", "Criminal", "Noble", "Royal", "Peasant", "Slave / Captive", "Foreigner / Outsider", "Refugee", "Hidden Important Person", "Secret Heir", "Religious Figure", "Clan Member", "Clan Failure", "Clan Hope", "Community Hero", "Community Shame", "Unknown / No Status", "Custom"];
  const PERSONALITY_OPTS = ["Funny", "Smart", "Dumb / Naive", "Grumpy", "Brave", "Cowardly", "Kind", "Cruel", "Calm", "Hot-Headed", "Optimistic", "Pessimistic", "Sarcastic", "Serious", "Lazy", "Hardworking", "Loyal", "Selfish", "Charismatic", "Awkward", "Curious", "Secretive", "Honest", "Liar", "Stubborn", "Gentle", "Cold", "Chaotic", "Disciplined", "Introverted", "Extroverted", "Ambitious", "Humble", "Prideful", "Manipulative", "Innocent", "Cynical", "Rebellious", "Protective", "Custom"];
  const POWER_ORIGIN_OPTS = ["Born With Power", "Trained Power", "Inherited Bloodline", "Divine Gift", "Demonic Power", "Spirit Contract", "Curse-Based Power", "Artifact / Relic-Based Power", "Technology-Based Power", "Experiment-Based Power", "Soul-Based Power", "Magic Study", "Forbidden Knowledge", "Transformation-Based Power", "Summoning-Based Power", "Stolen Power", "Borrowed Power", "Awakened Later", "Unknown Origin", "No Power Yet", "Custom"];
  const POWER_TYPE_OPTS = ["Magic", "Super Strength", "Super Speed", "Enhanced Senses", "Element Control", "Fire", "Water", "Ice", "Lightning", "Wind", "Earth", "Light", "Darkness", "Healing", "Barrier / Shield", "Telekinesis", "Telepathy", "Illusion", "Mind Control", "Time Ability", "Space Ability", "Gravity Ability", "Reality Bending", "Soul Ability", "Bloodline Ability", "Curse Ability", "Demon Ability", "Divine Ability", "Spirit Ability", "Beast / Monster Ability", "Transformation", "Summoning", "Weapon-Based Power", "Artifact-Based Power", "Technology / Cybernetic Ability", "Energy Projection", "Flight", "Regeneration", "Copy Ability", "Sealing Ability", "Forbidden Ability", "No Power", "Custom"];
  const POWER_LEVEL_OPTS = ["No Power", "Unknown Level", "Very Weak", "Weak", "Below Average", "Average", "Above Average", "Strong", "Very Strong", "Elite", "Hero Level", "Captain / Commander Level", "Royal / Noble Level", "Monster Level", "Demon Level", "Divine Level", "Country Level", "World Level", "Planet Level", "Dimension Level", "Multiverse Level", "Broken / Overpowered", "Sealed Power", "Hidden Potential", "Custom"];
  const ARC_OPTS = ["Positive Change Arc", "Negative Change Arc", "Flat Arc", "Corruption Arc", "Redemption Arc", "Revenge Arc", "Coming Of Age Arc", "Healing Arc", "Fall From Grace Arc", "Rise To Leadership Arc", "Power Awakening Arc", "Identity Discovery Arc", "Freedom Arc", "Survival Arc", "Sacrifice Arc", "Tragic Hero Arc", "Villain Origin Arc", "Antihero Softening Arc", "Broken To Whole Arc", "Naive To Mature Arc", "Coward To Brave Arc", "Selfish To Selfless Arc", "Weak To Strong Arc", "Outcast To Belonging Arc", "Custom"];

  const ad = (data as any).appearance_and_visual_design;
  const fa = (data as any).main_character_faction_alignment;
  const bms = (data as any).character_backstory_mental_state_and_community_place;
  const per = (data as any).character_personality;
  const pow = (data as any).optional_powers_and_power_level;
  const arc = (data as any).character_arc_and_threat_connection;

  return (
    <div className="rounded-xl border-2 border-slate-900 bg-white sm:rounded-2xl">
      {/* Tab bar */}
      <div className="flex flex-wrap border-b-2 border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2.5 text-xs font-bold transition sm:px-4 sm:py-3 sm:text-sm ${activeTab === tab.key ? "border-b-2 border-slate-900 bg-slate-100 text-slate-900 -mb-0.5" : "text-slate-500 hover:text-slate-700"}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="p-3 sm:p-4 max-h-[60vh] overflow-y-auto space-y-4">
        {/* ===== TAB 1: Status & Role ===== */}
        {activeTab === "status_role" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-black text-sm">Status</h3>
              <OptionGrid options={STATUS_OPTS} selected={(data as any).status.selected} onSelect={updStr(["status", "selected"])} />
              {(data as any).status.selected === "custom" && <CustomInput label="Custom status" value={(data as any).status.custom_status} onChange={updStr(["status", "custom_status"])} />}
            </div>
            <div>
              <h3 className="mb-2 font-black text-sm">Character Role Level</h3>
              <OptionGrid options={ROLE_OPTS} selected={(data as any).character_role_level.selected} onSelect={updStr(["character_role_level", "selected"])} />
              {(data as any).character_role_level.selected === "Custom" && <CustomInput label="Custom role" value={(data as any).character_role_level.custom_character_role_level} onChange={updStr(["character_role_level", "custom_character_role_level"])} />}
            </div>
          </div>
        )}

        {/* ===== TAB 2: Appearance ===== */}
        {activeTab === "appearance" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-black text-sm">Visual Style</h3>
              <OptionGrid options={VISUAL_STYLE_OPTS} selected={ad.selected_visual_style} onSelect={updStr(["appearance_and_visual_design", "selected_visual_style"])} />
              {ad.selected_visual_style === "Custom" && <CustomInput label="Custom visual style" value={ad.custom_visual_style} onChange={updStr(["appearance_and_visual_design", "custom_visual_style"])} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Age range" value={ad.appearance_details.age_range} onChange={updStr(["appearance_and_visual_design", "appearance_details", "age_range"])} />
              <Field label="Gender presentation" value={ad.appearance_details.gender_presentation} onChange={updStr(["appearance_and_visual_design", "appearance_details", "gender_presentation"])} />
              <Field label="Height" value={ad.appearance_details.height} onChange={updStr(["appearance_and_visual_design", "appearance_details", "height"])} />
              <Field label="Body type" value={ad.appearance_details.body_type} onChange={updStr(["appearance_and_visual_design", "appearance_details", "body_type"])} />
              <Field label="Silhouette shape" value={ad.appearance_details.silhouette_shape} onChange={updStr(["appearance_and_visual_design", "appearance_details", "silhouette_shape"])} />
              <Field label="Face shape" value={ad.appearance_details.face_shape} onChange={updStr(["appearance_and_visual_design", "appearance_details", "face_shape"])} />
              <Field label="Skin tone / markings" value={ad.appearance_details.skin_tone_or_markings} onChange={updStr(["appearance_and_visual_design", "appearance_details", "skin_tone_or_markings"])} />
              <Field label="Hair style" value={ad.appearance_details.hair_style} onChange={updStr(["appearance_and_visual_design", "appearance_details", "hair_style"])} />
              <Field label="Hair color" value={ad.appearance_details.hair_color} onChange={updStr(["appearance_and_visual_design", "appearance_details", "hair_color"])} />
              <Field label="Eye shape" value={ad.appearance_details.eye_shape} onChange={updStr(["appearance_and_visual_design", "appearance_details", "eye_shape"])} />
              <Field label="Eye color" value={ad.appearance_details.eye_color} onChange={updStr(["appearance_and_visual_design", "appearance_details", "eye_color"])} />
              <Field label="Clothing style" value={ad.appearance_details.clothing_style} onChange={updStr(["appearance_and_visual_design", "appearance_details", "clothing_style"])} />
              <Field label="Iconic item" value={ad.appearance_details.iconic_item} onChange={updStr(["appearance_and_visual_design", "appearance_details", "iconic_item"])} />
              <Field label="Expression style" value={ad.appearance_details.expression_style} onChange={updStr(["appearance_and_visual_design", "appearance_details", "expression_style"])} />
              <Field label="Pose language" value={ad.appearance_details.pose_language} onChange={updStr(["appearance_and_visual_design", "appearance_details", "pose_language"])} />
            </div>
            <Field label="Main outfit description" value={ad.appearance_details.main_outfit_description} onChange={updStr(["appearance_and_visual_design", "appearance_details", "main_outfit_description"])} textarea />
            <Field label="Visual symbol / motif" value={ad.appearance_details.visual_symbol_or_motif} onChange={updStr(["appearance_and_visual_design", "appearance_details", "visual_symbol_or_motif"])} />
            <Field label="AI image prompt notes" value={ad.appearance_details.ai_image_prompt_notes} onChange={updStr(["appearance_and_visual_design", "appearance_details", "ai_image_prompt_notes"])} textarea />
            <Field label="Negative prompt notes" value={ad.appearance_details.negative_prompt_notes} onChange={updStr(["appearance_and_visual_design", "appearance_details", "negative_prompt_notes"])} textarea />
          </div>
        )}

        {/* ===== TAB 3: Faction Alignment ===== */}
        {activeTab === "faction" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-black text-sm">Faction Alignment</h3>
              <OptionGrid options={FACTION_ALIGN_OPTS} selected={fa.selected} onSelect={updStr(["main_character_faction_alignment", "selected"])} />
              {fa.selected === "Custom" && <CustomInput label="Custom alignment" value={fa.custom_alignment_type} onChange={updStr(["main_character_faction_alignment", "custom_alignment_type"])} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Linked master faction" value={fa.alignment_details.linked_master_faction} onChange={updStr(["main_character_faction_alignment", "alignment_details", "linked_master_faction"])} />
              <Field label="Character role in faction" value={fa.alignment_details.character_role_in_faction} onChange={updStr(["main_character_faction_alignment", "alignment_details", "character_role_in_faction"])} />
              <Field label="Loyalty level" value={fa.alignment_details.loyalty_level} onChange={updStr(["main_character_faction_alignment", "alignment_details", "loyalty_level"])} />
              <Field label="Reason for following this side" value={fa.alignment_details.reason_for_following_this_side} onChange={updStr(["main_character_faction_alignment", "alignment_details", "reason_for_following_this_side"])} />
              <Field label="What faction wants from character" value={fa.alignment_details.what_the_faction_wants_from_character} onChange={updStr(["main_character_faction_alignment", "alignment_details", "what_the_faction_wants_from_character"])} />
              <Field label="What character wants from faction" value={fa.alignment_details.what_character_wants_from_faction} onChange={updStr(["main_character_faction_alignment", "alignment_details", "what_character_wants_from_faction"])} />
              <Field label="Conflict with faction" value={fa.alignment_details.conflict_with_faction} onChange={updStr(["main_character_faction_alignment", "alignment_details", "conflict_with_faction"])} />
              <Field label="Public allegiance" value={fa.alignment_details.public_allegiance} onChange={updStr(["main_character_faction_alignment", "alignment_details", "public_allegiance"])} />
              <Field label="Hidden allegiance" value={fa.alignment_details.hidden_allegiance} onChange={updStr(["main_character_faction_alignment", "alignment_details", "hidden_allegiance"])} />
              <Field label="Side change trigger" value={fa.alignment_details.side_change_trigger} onChange={updStr(["main_character_faction_alignment", "alignment_details", "side_change_trigger"])} />
            </div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={fa.alignment_details.can_change_sides} onChange={(e) => updBool(["main_character_faction_alignment", "alignment_details", "can_change_sides"])(e.target.checked)} className="rounded" />
              <span className="text-sm font-bold">Can change sides</span>
            </label>
          </div>
        )}

        {/* ===== TAB 4: Backstory & Mental State ===== */}
        {activeTab === "backstory" && (
          <div className="space-y-5">
            <div>
              <h3 className="mb-2 font-black text-sm">Backstory Type</h3>
              <OptionGrid options={BACKSTORY_OPTS} selected={bms.selected_backstory_type} onSelect={updStr(["character_backstory_mental_state_and_community_place", "selected_backstory_type"])} />
              {bms.selected_backstory_type === "Custom" && <CustomInput label="Custom backstory type" value={bms.custom_backstory_type} onChange={updStr(["character_backstory_mental_state_and_community_place", "custom_backstory_type"])} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Birthplace" value={bms.backstory_details.birthplace} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "birthplace"])} />
              <Field label="Family situation" value={bms.backstory_details.family_situation} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "family_situation"])} />
              <Field label="Childhood summary" value={bms.backstory_details.childhood_summary} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "childhood_summary"])} textarea />
              <Field label="Important past event" value={bms.backstory_details.important_past_event} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "important_past_event"])} textarea />
              <Field label="Past trauma or wound" value={bms.backstory_details.past_trauma_or_wound} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "past_trauma_or_wound"])} />
              <Field label="Past failure" value={bms.backstory_details.past_failure} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "past_failure"])} />
              <Field label="Past success" value={bms.backstory_details.past_success} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "past_success"])} />
              <Field label="Secret from past" value={bms.backstory_details.secret_from_past} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "secret_from_past"])} />
              <Field label="What character lost" value={bms.backstory_details.what_the_character_lost} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "what_the_character_lost"])} />
              <Field label="What character gained" value={bms.backstory_details.what_the_character_gained} onChange={updStr(["character_backstory_mental_state_and_community_place", "backstory_details", "what_the_character_gained"])} />
            </div>

            <hr className="border-slate-200" />
            <div>
              <h3 className="mb-2 font-black text-sm">Mental State</h3>
              <OptionGrid options={MENTAL_STATE_OPTS} selected={bms.selected_mental_state} onSelect={updStr(["character_backstory_mental_state_and_community_place", "selected_mental_state"])} />
              {bms.selected_mental_state === "Custom" && <CustomInput label="Custom mental state" value={bms.custom_mental_state} onChange={updStr(["character_backstory_mental_state_and_community_place", "custom_mental_state"])} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Current emotional state" value={bms.mental_state_details.current_emotional_state} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "current_emotional_state"])} />
              <Field label="Main fear" value={bms.mental_state_details.main_fear} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "main_fear"])} />
              <Field label="Main desire" value={bms.mental_state_details.main_desire} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "main_desire"])} />
              <Field label="Inner need" value={bms.mental_state_details.inner_need} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "inner_need"])} />
              <Field label="Outer goal" value={bms.mental_state_details.outer_goal} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "outer_goal"])} />
              <Field label="Biggest strength" value={bms.mental_state_details.biggest_strength} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "biggest_strength"])} />
              <Field label="Biggest flaw" value={bms.mental_state_details.biggest_flaw} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "biggest_flaw"])} />
              <Field label="Fatal flaw" value={bms.mental_state_details.fatal_flaw} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "fatal_flaw"])} />
              <Field label="Emotional wound" value={bms.mental_state_details.emotional_wound} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "emotional_wound"])} />
              <Field label="Coping mechanism" value={bms.mental_state_details.coping_mechanism} onChange={updStr(["character_backstory_mental_state_and_community_place", "mental_state_details", "coping_mechanism"])} />
            </div>

            <hr className="border-slate-200" />
            <div>
              <h3 className="mb-2 font-black text-sm">Community Place</h3>
              <OptionGrid options={COMMUNITY_OPTS} selected={bms.selected_community_place} onSelect={updStr(["character_backstory_mental_state_and_community_place", "selected_community_place"])} />
              {bms.selected_community_place === "Custom" && <CustomInput label="Custom community place" value={bms.custom_community_place} onChange={updStr(["character_backstory_mental_state_and_community_place", "custom_community_place"])} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Community name" value={bms.community_place_details.community_name} onChange={updStr(["character_backstory_mental_state_and_community_place", "community_place_details", "community_name"])} />
              <Field label="Social class" value={bms.community_place_details.social_class} onChange={updStr(["character_backstory_mental_state_and_community_place", "community_place_details", "social_class"])} />
              <Field label="Public reputation" value={bms.community_place_details.public_reputation} onChange={updStr(["character_backstory_mental_state_and_community_place", "community_place_details", "public_reputation"])} />
              <Field label="How people treat them" value={bms.community_place_details.how_people_treat_them} onChange={updStr(["character_backstory_mental_state_and_community_place", "community_place_details", "how_people_treat_them"])} />
              <Field label="Responsibilities" value={bms.community_place_details.responsibilities_in_community} onChange={updStr(["character_backstory_mental_state_and_community_place", "community_place_details", "responsibilities_in_community"])} />
              <Field label="Desired new status" value={bms.community_place_details.desired_new_status} onChange={updStr(["character_backstory_mental_state_and_community_place", "community_place_details", "desired_new_status"])} />
            </div>
          </div>
        )}

        {/* ===== TAB 5: Personality ===== */}
        {activeTab === "personality" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-black text-sm">Personality Types</h3>
              <OptionGrid options={PERSONALITY_OPTS} selected={per.selected_personality_types} onSelect={(v) => toggleArr(["character_personality", "selected_personality_types"], v)} multi />
              {per.selected_personality_types.includes("Custom") && <CustomInput label="Custom personality type" value={per.custom_personality_type} onChange={updStr(["character_personality", "custom_personality_type"])} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Speech style" value={per.personality_details.speech_style} onChange={updStr(["character_personality", "personality_details", "speech_style"])} />
              <Field label="Humor style" value={per.personality_details.humor_style} onChange={updStr(["character_personality", "personality_details", "humor_style"])} />
              <Field label="Habit or quirk" value={per.personality_details.habit_or_quirk} onChange={updStr(["character_personality", "personality_details", "habit_or_quirk"])} />
              <Field label="Public personality" value={per.personality_details.public_personality} onChange={updStr(["character_personality", "personality_details", "public_personality"])} />
              <Field label="Private personality" value={per.personality_details.private_personality} onChange={updStr(["character_personality", "personality_details", "private_personality"])} />
              <Field label="True self" value={per.personality_details.true_self} onChange={updStr(["character_personality", "personality_details", "true_self"])} />
            </div>
            <Field label="Behavior when safe" value={per.personality_details.behavior_when_safe} onChange={updStr(["character_personality", "personality_details", "behavior_when_safe"])} textarea />
            <Field label="Behavior when threatened" value={per.personality_details.behavior_when_threatened} onChange={updStr(["character_personality", "personality_details", "behavior_when_threatened"])} textarea />
            <Field label="Behavior under pressure" value={per.personality_details.behavior_under_pressure} onChange={updStr(["character_personality", "personality_details", "behavior_under_pressure"])} textarea />
            <Field label="Biggest personality flaw" value={per.personality_details.biggest_personality_flaw} onChange={updStr(["character_personality", "personality_details", "biggest_personality_flaw"])} />
            <Field label="Personality contradiction" value={per.personality_details.personality_contradiction} onChange={updStr(["character_personality", "personality_details", "personality_contradiction"])} />
            <Field label="Personality change arc" value={per.personality_details.personality_change_arc} onChange={updStr(["character_personality", "personality_details", "personality_change_arc"])} />
          </div>
        )}

        {/* ===== TAB 6: Powers ===== */}
        {activeTab === "powers" && (
          <div className="space-y-4">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={pow.is_enabled} onChange={(e) => updBool(["optional_powers_and_power_level", "is_enabled"])(e.target.checked)} className="rounded" />
              <span className="text-sm font-black">Enable powers section</span>
            </label>
            {!pow.is_enabled && <Field label="Reason if disabled" value={pow.reason_if_disabled} onChange={updStr(["optional_powers_and_power_level", "reason_if_disabled"])} />}
            {pow.is_enabled && (
              <>
                <div>
                  <h3 className="mb-2 font-black text-sm">Power Origin</h3>
                  <OptionGrid options={POWER_ORIGIN_OPTS} selected={pow.selected_power_origin} onSelect={updStr(["optional_powers_and_power_level", "selected_power_origin"])} />
                  {pow.selected_power_origin === "Custom" && <CustomInput label="Custom power origin" value={pow.custom_power_origin} onChange={updStr(["optional_powers_and_power_level", "custom_power_origin"])} />}
                </div>
                <div>
                  <h3 className="mb-2 font-black text-sm">Power Type</h3>
                  <OptionGrid options={POWER_TYPE_OPTS} selected={pow.selected_power_type} onSelect={updStr(["optional_powers_and_power_level", "selected_power_type"])} />
                  {pow.selected_power_type === "Custom" && <CustomInput label="Custom power type" value={pow.custom_power_type} onChange={updStr(["optional_powers_and_power_level", "custom_power_type"])} />}
                </div>
                <div>
                  <h3 className="mb-2 font-black text-sm">Power Level</h3>
                  <OptionGrid options={POWER_LEVEL_OPTS} selected={pow.selected_power_level} onSelect={updStr(["optional_powers_and_power_level", "selected_power_level"])} />
                  {pow.selected_power_level === "Custom" && <CustomInput label="Custom power level" value={pow.custom_power_level} onChange={updStr(["optional_powers_and_power_level", "custom_power_level"])} />}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Power name" value={pow.power_details.power_name} onChange={updStr(["optional_powers_and_power_level", "power_details", "power_name"])} />
                  <Field label="Power source" value={pow.power_details.power_source} onChange={updStr(["optional_powers_and_power_level", "power_details", "power_source"])} />
                  <Field label="Ultimate ability" value={pow.power_details.ultimate_ability} onChange={updStr(["optional_powers_and_power_level", "power_details", "ultimate_ability"])} />
                  <Field label="Control level" value={pow.power_details.control_level} onChange={updStr(["optional_powers_and_power_level", "power_details", "control_level"])} />
                  <Field label="Growth potential" value={pow.power_details.growth_potential} onChange={updStr(["optional_powers_and_power_level", "power_details", "growth_potential"])} />
                  <Field label="Risk to user" value={pow.power_details.risk_to_user} onChange={updStr(["optional_powers_and_power_level", "power_details", "risk_to_user"])} />
                </div>
                <Field label="Power description" value={pow.power_details.power_description} onChange={updStr(["optional_powers_and_power_level", "power_details", "power_description"])} textarea />
                <Field label="Power limitations" value={pow.power_details.power_limitations} onChange={updStr(["optional_powers_and_power_level", "power_details", "power_limitations"])} textarea />
              </>
            )}
          </div>
        )}

        {/* ===== TAB 7: Arc & Threats ===== */}
        {activeTab === "arc" && (
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 font-black text-sm">Character Arc Type</h3>
              <OptionGrid options={ARC_OPTS} selected={arc.selected_arc_type} onSelect={updStr(["character_arc_and_threat_connection", "selected_arc_type"])} />
              {arc.selected_arc_type === "Custom" && <CustomInput label="Custom arc type" value={arc.custom_arc_type} onChange={updStr(["character_arc_and_threat_connection", "custom_arc_type"])} />}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Starting belief" value={arc.arc_details.starting_belief} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "starting_belief"])} />
              <Field label="False belief or lie" value={arc.arc_details.false_belief_or_lie} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "false_belief_or_lie"])} />
              <Field label="Truth they must learn" value={arc.arc_details.truth_they_must_learn} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "truth_they_must_learn"])} />
              <Field label="Personal goal" value={arc.arc_details.personal_goal} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "personal_goal"])} />
              <Field label="Main internal conflict" value={arc.arc_details.main_internal_conflict} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "main_internal_conflict"])} />
              <Field label="Main external conflict" value={arc.arc_details.main_external_conflict} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "main_external_conflict"])} />
              <Field label="What forces change" value={arc.arc_details.what_forces_them_to_change} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "what_forces_them_to_change"])} />
              <Field label="Lowest point" value={arc.arc_details.lowest_point} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "lowest_point"])} />
              <Field label="Turning point" value={arc.arc_details.turning_point} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "turning_point"])} />
              <Field label="Final state" value={arc.arc_details.final_state} onChange={updStr(["character_arc_and_threat_connection", "arc_details", "final_state"])} />
            </div>
            <hr className="border-slate-200" />
            <h3 className="font-black text-sm">Threat Connection</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Linked major threat" value={arc.threat_connection_details.linked_major_threat} onChange={updStr(["character_arc_and_threat_connection", "threat_connection_details", "linked_major_threat"])} />
              <Field label="Why character cares" value={arc.threat_connection_details.why_character_cares_about_threat} onChange={updStr(["character_arc_and_threat_connection", "threat_connection_details", "why_character_cares_about_threat"])} />
              <Field label="How threat blocks goal" value={arc.threat_connection_details.how_major_threat_blocks_character_goal} onChange={updStr(["character_arc_and_threat_connection", "threat_connection_details", "how_major_threat_blocks_character_goal"])} />
              <Field label="How character damages threat" value={arc.threat_connection_details.how_character_can_damage_or_stop_threat} onChange={updStr(["character_arc_and_threat_connection", "threat_connection_details", "how_character_can_damage_or_stop_threat"])} />
              <Field label="How threat breaks character" value={arc.threat_connection_details.how_threat_can_break_character} onChange={updStr(["character_arc_and_threat_connection", "threat_connection_details", "how_threat_can_break_character"])} />
              <Field label="Final conflict role" value={arc.threat_connection_details.final_conflict_role} onChange={updStr(["character_arc_and_threat_connection", "threat_connection_details", "final_conflict_role"])} />
            </div>
            <Field label="Personal stakes if threat wins" value={arc.threat_connection_details.personal_stakes_if_threat_wins} onChange={updStr(["character_arc_and_threat_connection", "threat_connection_details", "personal_stakes_if_threat_wins"])} textarea />
          </div>
        )}
      </div>
    </div>
  );
}
