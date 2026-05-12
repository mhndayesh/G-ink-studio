// Pure data + helpers for the Plot Board screen — no React. Extracted from
// page.tsx so the screen file is smaller and these can be unit-tested.

export const ARC_LENGTH_OPTS = ["One-Shot", "Short Arc", "Medium Arc", "Long Arc", "Saga", "Season", "Full Series", "Custom"];
export const ARC_LENGTH_SPECS: Record<string, { min: number; ideal: number; max: number; label: string }> = {
  "One-Shot": { min: 1, ideal: 1, max: 1, label: "1 chapter" },
  "Short Arc": { min: 3, ideal: 4, max: 5, label: "3-5 chapters" },
  "Medium Arc": { min: 6, ideal: 8, max: 10, label: "6-10 chapters" },
  "Long Arc": { min: 11, ideal: 14, max: 16, label: "11-16 chapters" },
  "Saga": { min: 17, ideal: 22, max: 28, label: "17-28 chapters" },
  "Season": { min: 20, ideal: 26, max: 32, label: "20-32 chapters" },
  "Full Series": { min: 40, ideal: 60, max: 80, label: "40-80 chapters" },
  "Custom": { min: 1, ideal: 8, max: 99, label: "custom target" },
};
export const STRUCTURE_BEATS: Record<string, Array<{ key: string; label: string; purpose: string }>> = {
  "Mystery Arc": [
    { key: "mystery_setup", label: "Mystery Setup", purpose: "Establish the anomaly, victim, impossible contradiction, or first unsettling question." },
    { key: "clue_investigation", label: "Clue Investigation", purpose: "Gather clues, lore, suspects, false leads, and rules of the mystery." },
    { key: "escalation_pressure", label: "Escalation / Pressure", purpose: "The mystery pushes back; danger, pursuit, paranoia, or moral cost rises." },
    { key: "major_reveal", label: "Major Reveal", purpose: "Expose the hidden truth that recontextualizes the case and forces the final choice." },
    { key: "confrontation_payoff", label: "Confrontation / Payoff", purpose: "Resolve the arc question through confrontation, sacrifice, or decisive consequence." },
  ],
  "Kishotenketsu": [
    { key: "ki_introduction", label: "Ki - Introduction", purpose: "Introduce the premise, tone, question, and normal rhythm." },
    { key: "sho_development", label: "Sho - Development", purpose: "Develop the situation and deepen tension without forcing the final conflict yet." },
    { key: "ten_twist_or_turn", label: "Ten - Twist / Turn", purpose: "Reveal the twist or turn that changes the reader's understanding." },
    { key: "ketsu_conclusion", label: "Ketsu - Conclusion", purpose: "Pay off the emotional and story consequences of the turn." },
  ],
  "Three-Act Structure": [
    { key: "act_1_setup", label: "Act 1 - Setup", purpose: "Open the conflict, goal, stakes, and first irreversible choice." },
    { key: "act_2_escalation", label: "Act 2 - Escalation", purpose: "Complicate the goal, raise stakes, and pressure the protagonist." },
    { key: "act_3_climax_resolution", label: "Act 3 - Climax / Resolution", purpose: "Final confrontation, payoff, and new status quo." },
  ],
  "Hero's Journey": [
    { key: "act_1_setup", label: "Departure / Setup", purpose: "Ordinary world, call, refusal, mentor, and threshold." },
    { key: "act_2_escalation", label: "Initiation / Ordeal", purpose: "Trials, allies, enemies, ordeal, reward, and transformation." },
    { key: "act_3_climax_resolution", label: "Return / Resolution", purpose: "Return, final test, changed self, and earned resolution." },
  ],
};
export const CHAPTER_CONTENT_FIELDS = [
  "chapter_title",
  "chapter_purpose",
  "structure_section",
  "summary",
  "characters_present",
  "relationships_used",
  "factions_used",
  "threats_used",
  "world_rules_shown",
  "power_system_shown",
  "main_conflict",
  "emotional_beat",
  "twist_or_hook",
  "ending_cliffhanger",
  "custom_chapter_details",
];

/** The Plot Board "Create / Edit Chapter" modal form. All text fields are
 *  strings; multi-select fields are stored comma-joined. `chapter_number` is
 *  only present transiently (set from computed hints, parsed loosely on submit). */
export interface ChapterForm {
  chapter_id: string;
  arc_title: string;
  chapter_title: string;
  chapter_purpose: string;
  structure_section: string;
  summary: string;
  characters_present: string;
  relationships_used: string;
  factions_used: string;
  threats_used: string;
  world_rules_shown: string;
  power_system_shown: string;
  main_conflict: string;
  emotional_beat: string;
  twist_or_hook: string;
  ending_cliffhanger: string;
  custom_chapter_details: string;
  chapter_number?: number | string;
}

export const EMPTY_CHAPTER_FORM: ChapterForm = {
  chapter_id: "", arc_title: "", chapter_title: "", chapter_purpose: "", structure_section: "",
  summary: "", characters_present: "", relationships_used: "", factions_used: "", threats_used: "",
  world_rules_shown: "", power_system_shown: "", main_conflict: "", emotional_beat: "",
  twist_or_hook: "", ending_cliffhanger: "", custom_chapter_details: "",
};

/** The "Arc overview" form. (`enrichArc` may return extra keys, e.g. arc_summary
 *  / *_used arrays — those are spread in at runtime and patched through too.) */
export interface ArcForm {
  arc_title: string;
  arc_number: number;
  arc_type: string;
  arc_length_type: string;
  starting_status_quo: string;
  main_story_question: string;
  central_emotional_question: string;
  main_external_conflict: string;
  main_internal_conflict: string;
  main_relationship_conflict: string;
  main_threat_used: string;
  ending_type_target: string;
}

export const EMPTY_ARC_FORM: ArcForm = {
  arc_title: "", arc_number: 1, arc_type: "", arc_length_type: "", starting_status_quo: "",
  main_story_question: "", central_emotional_question: "", main_external_conflict: "",
  main_internal_conflict: "", main_relationship_conflict: "", main_threat_used: "", ending_type_target: "",
};

/** Short prompt-hint guidance string for a chosen arc length. */
export function arcLengthGuidance(length: string): string {
  const guides: Record<string, string> = {
    "One-Shot": "Target a complete one-chapter arc.",
    "Short Arc": "Target a compact 3-5 chapter arc with quick setup, escalation, reveal, and payoff.",
    "Medium Arc": "Target roughly 6-10 chapters with clear midpoint pressure and a strong final payoff.",
    "Long Arc": "Target roughly 11-16 chapters with multiple escalation turns before the climax.",
    "Saga": "Target a large multi-phase arc with several sub-conflicts feeding one major payoff.",
    "Season": "Target a season-length arc with opening, middle pressure, finale, and hook for the next arc.",
    "Full Series": "Treat the structure as a full-series spine with major act breaks and long-term payoff.",
    "Custom": "Use the user's custom arc length intent and keep chapter pacing consistent with it.",
  };
  return guides[length] || "";
}

/** Fill an LLM-returned arc-overview object with defaults and normalise
 *  `arc_length_type` (the LLM sometimes returns it as `{ selected: "..." }`). */
export function enrichArc(ao: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const src = ao || {};
  return {
    arc_title: "", arc_type: "", arc_number: 1,
    arc_summary: "", starting_status_quo: "",
    main_story_question: "", central_emotional_question: "",
    main_external_conflict: "", main_internal_conflict: "",
    main_relationship_conflict: "", main_threat_used: "",
    minor_threats_used: [], main_factions_used: [],
    main_characters_used: [], relationships_used: [],
    ending_type_target: "", custom_arc_overview_details: "",
    ...src,
    arc_length_type: selectedOptionValue((src as Record<string, unknown>).arc_length_type ?? ""),
  };
}

export function hasContent(value: any): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasContent);
  if (typeof value === "object") return Object.values(value).some(hasContent);
  return true;
}

export function isMeaningfulChapter(chapter: any): boolean {
  return CHAPTER_CONTENT_FIELDS.some((field) => hasContent(chapter?.[field]));
}

export function selectedOptionValue(value: any): string {
  let current = value;
  for (let i = 0; i < 4; i += 1) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = current.selected;
      continue;
    }
    return current ? String(current) : "";
  }
  return "";
}
