import type { Phase } from "./types";

export type StageInfo = { key: string; label: string; startIdx: number; endIdx: number };

export const STAGES: StageInfo[] = [
  { key: "foundation", label: "Foundation", startIdx: 0, endIdx: 2 },
  { key: "characters", label: "Characters", startIdx: 3, endIdx: 6 },
  { key: "plot", label: "Plot", startIdx: 7, endIdx: 10 },
  { key: "write", label: "Write", startIdx: 11, endIdx: 11 },
  { key: "produce", label: "Produce", startIdx: 12, endIdx: 15 },
  { key: "review", label: "Review", startIdx: 16, endIdx: 18 },
  { key: "tools", label: "Tools", startIdx: 19, endIdx: 19 },
];

export type PhaseExtended = Phase & {
  stage: string;
  unlockRequirements?: Record<string, "completed" | "available">;
};

export function phases(storyId: string): PhaseExtended[] {
  const base = `/studio/${storyId}`;
  return [
    // ── Foundation ───────────────────────────────────────────────────
    { key: "home", title: "Studio Home", href: `${base}/home`, file: "status", description: "Project pulse and next step.", stage: "foundation" },
    { key: "seed", title: "Story Seed", href: `${base}/seed`, file: "master_story.json", description: "Title, idea, genre, ending, foundation.", stage: "foundation" },
    { key: "world", title: "World Core", href: `${base}/world`, file: "master_story.json", description: "World scale, rules, factions, threats.", stage: "foundation", unlockRequirements: { master_story: "completed" } },
    // ── Characters ────────────────────────────────────────────────────
    { key: "cast", title: "Cast Forge", href: `${base}/cast`, file: "characters.json", description: "Major character structure, queue, profiles.", stage: "characters", unlockRequirements: { world_core: "completed" } },
    { key: "side", title: "Side Cast", href: `${base}/side`, file: "characters.json", description: "Supporting cast, minor characters, extras.", stage: "characters", unlockRequirements: { characters: "completed" } },
    { key: "web", title: "Relationship Web", href: `${base}/web`, file: "characters.json", description: "Locked until two real profiles exist.", stage: "characters", unlockRequirements: { relationship_map: "available" } },
    { key: "faction-visuals", title: "Faction Visuals", href: `${base}/faction-visuals`, file: "master_story.json", description: "Visual identity per faction — AI prompts using character appearances for faction gear.", stage: "characters", unlockRequirements: { characters: "completed" } },
    // ── Plot ─────────────────────────────────────────────────────────
    { key: "board", title: "Plot Board", href: `${base}/board`, file: "plot_outline.json", description: "Narrative structure, arc, chapters.", stage: "plot", unlockRequirements: { characters: "completed" } },
    { key: "scenes", title: "Scene Cards", href: `${base}/scenes`, file: "plot_outline.json", description: "Scene breakdown grouped by chapter.", stage: "plot", unlockRequirements: { plot_outline: "completed", locations: "completed" } },
    { key: "threads", title: "Plot Threads", href: `${base}/threads`, file: "plot_outline.json", description: "Main plot, arcs, relationships, threats, powers.", stage: "plot", unlockRequirements: { plot_outline: "completed" } },
    { key: "locations", title: "Locations", href: `${base}/locations`, file: "plot_outline.json", description: "Named locations with AI background prompts.", stage: "plot", unlockRequirements: { characters: "completed" } },
    // ── Write ─────────────────────────────────────────────────────────
    { key: "court", title: "Consequence Court", href: `${base}/court`, file: "plot_workspace.json", description: "Questions, answers, confirmation.", stage: "write", unlockRequirements: { plot_workspace: "completed" } },
    // ── Produce ───────────────────────────────────────────────────────
    { key: "script", title: "Manga Script", href: `${base}/script`, file: "chapter_script.json", description: "Pages, panels, dialogue, approval.", stage: "produce", unlockRequirements: { plot_outline: "completed", locations: "completed", integrity_locked: "available" } },
    { key: "visuals-studio", title: "Visuals Studio", href: `${base}/visuals-studio`, file: "chapter_script.json", description: "Per-panel render mode and location — set after panels exist so the AI knows what each panel shows.", stage: "produce", unlockRequirements: { chapter_script: "available", locations: "completed", integrity_locked: "available" } },
    { key: "desk", title: "Writing Desk", href: `${base}/desk`, file: "plot_workspace.json", description: "Expand, rewrite, and refine chapters with AI.", stage: "produce", unlockRequirements: { chapter_script: "available" } },
    { key: "export", title: "Export", href: `${base}/export`, file: "download", description: "Export story, visuals, and scenes as text, Markdown, Word, or ZIP.", stage: "produce", unlockRequirements: { plot_outline: "completed", locations: "completed", integrity_locked: "available" } },
    // ── Review ────────────────────────────────────────────────────────
    { key: "timeline", title: "Memory Timeline", href: `${base}/timeline`, file: "versions", description: "Versions and event history.", stage: "review" },
    { key: "radar", title: "Continuity Radar", href: `${base}/radar`, file: "continuity", description: "Contradictions and warnings.", stage: "review" },
    { key: "control", title: "Control Room", href: `${base}/control`, file: "advanced", description: "Raw API / JSON links.", stage: "review" },
    // ── Tools (Auto-Pilot — additive layer on top of the existing 19 phases) ──
    { key: "auto", title: "Auto-Pilot", href: `${base}/auto`, file: "tools", description: "One-click full story generation: idea → all phases → export.", stage: "tools" },
  ];
}

export function isPhaseUnlocked(phase: PhaseExtended, phaseStatuses: Record<string, string>): boolean {
  const reqs = phase.unlockRequirements;
  if (!reqs || Object.keys(reqs).length === 0) return true;
  return Object.entries(reqs).every(([key, requiredStatus]) => {
    const actual = phaseStatuses[key];
    if (!actual) return false;
    if (requiredStatus === "available") {
      return actual !== "locked";
    }
    return actual === requiredStatus;
  });
}
