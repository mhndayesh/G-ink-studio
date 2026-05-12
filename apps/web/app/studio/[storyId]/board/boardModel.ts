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
