export const AI_EMPTY_MESSAGE = "AI returned no usable fields. Retry in a minute or fill manually.";

export function unwrapGeneratedFields(data: any): Record<string, any> {
  const raw = data?.generated_fields ?? data ?? {};
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

function hasValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(hasValue);
  if (typeof value === "object") {
    return Object.entries(value)
      .filter(([key]) => !key.startsWith("_") && key !== "warnings")
      .some(([, child]) => hasValue(child));
  }
  return false;
}

const BOARD_CHAPTER_KEYS = [
  "chapter_title",
  "chapter_purpose",
  "structure_section",
  "summary",
  "characters_present",
  "factions_used",
  "threats_used",
  "relationships_used",
  "world_rules_shown",
  "power_system_shown",
  "main_conflict",
  "emotional_beat",
  "twist_or_hook",
  "ending_cliffhanger",
  "custom_chapter_details",
];

export function normalizeAiGeneratedFields(page: string, targetFields: string[], data: any): Record<string, any> {
  const gen = { ...unwrapGeneratedFields(data) };

  if (page === "threads") {
    if (gen.main_plot_thread && !gen.main) gen.main = gen.main_plot_thread;
    if (gen.character_arc_threads && !gen.character_arcs) gen.character_arcs = gen.character_arc_threads;
    if (gen.relationship_threads && !gen.relationships) gen.relationships = gen.relationship_threads;
    if (gen.threat_threads && !gen.threats) gen.threats = gen.threat_threads;
    if (gen.power_threads && !gen.powers) gen.powers = gen.power_threads;
  }

  if (page === "scenes") {
    if (Array.isArray(gen.scenes) && !gen.scenes_for_chapter) gen.scenes_for_chapter = gen.scenes;
    if (Array.isArray(gen.scene_cards) && !gen.scenes_for_chapter) gen.scenes_for_chapter = gen.scene_cards;
    if (Array.isArray(gen.recommendations) && !gen.scene_count_recommendations) gen.scene_count_recommendations = gen.recommendations;
  }

  if (page === "court") {
    if (gen.suggested_answers && !gen.suggest_answers) gen.suggest_answers = gen.suggested_answers;
    if (gen.suggest_answers && !gen.suggested_answers) gen.suggested_answers = gen.suggest_answers;
  }

  if (page === "world") {
    if (gen.world_details && !gen.world_core_details) gen.world_core_details = gen.world_details;
    if (gen.world_build && !gen.world_core_details) gen.world_core_details = gen.world_build;
    if (gen.world_core && !gen.world_core_details) gen.world_core_details = gen.world_core;
    if (!gen.world_core_details && (
      gen.rule_details
      || gen.faction_details
      || gen.threat_details
      || gen.world_master_rules
      || gen.major_factions_and_ruling_sides
      || gen.major_threats_and_minor_side_threats
    )) {
      gen.world_core_details = {
        rule_details: gen.rule_details,
        faction_details: gen.faction_details,
        threat_details: gen.threat_details,
        world_master_rules: gen.world_master_rules,
        major_factions_and_ruling_sides: gen.major_factions_and_ruling_sides,
        major_threats_and_minor_side_threats: gen.major_threats_and_minor_side_threats,
      };
    }
  }

  if (page === "board" && targetFields.includes("chapters") && !Array.isArray(gen.chapters)) {
    if (BOARD_CHAPTER_KEYS.some((key) => key in gen)) gen.chapters = [gen];
  }

  return gen;
}

export function hasUsableAiOutput(page: string, targetFields: string[], data: any): boolean {
  const gen = normalizeAiGeneratedFields(page, targetFields, data);
  const fieldsToCheck = page === "court"
    ? targetFields.map((field) => field === "suggest_answers" ? "suggested_answers" : field)
    : targetFields;

  if (fieldsToCheck.length === 0) return hasValue(gen);
  return fieldsToCheck.some((field) => hasValue(gen[field]));
}

export function getAiFailureMessage(data: any): string {
  const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
  const joined = warnings.filter(Boolean).join(" ");
  if (/timeout|timed out/i.test(joined)) {
    return "AI timed out before returning usable fields. Retry in a minute or fill manually.";
  }
  if (joined) return `${AI_EMPTY_MESSAGE} ${joined}`;
  return AI_EMPTY_MESSAGE;
}

export function getUsableAiOutput(page: string, targetFields: string[], data: any): Record<string, any> {
  const gen = normalizeAiGeneratedFields(page, targetFields, data);
  if (!hasUsableAiOutput(page, targetFields, gen)) {
    throw new Error(getAiFailureMessage(data));
  }
  return gen;
}

export function getExpansionText(data: any): string {
  const text = data?.expanded_text || data?.text || "";
  return typeof text === "string" ? text.trim() : "";
}
