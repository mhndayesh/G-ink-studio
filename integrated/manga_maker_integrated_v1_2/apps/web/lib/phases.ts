import type { Phase } from "./types";

export type StageInfo = { key: string; label: string; startIdx: number; endIdx: number };

export const STAGES: StageInfo[] = [
  { key: "foundation", label: "Foundation", startIdx: 0, endIdx: 2 },
  { key: "characters", label: "Characters", startIdx: 3, endIdx: 5 },
  { key: "plot", label: "Plot", startIdx: 6, endIdx: 8 },
  { key: "write", label: "Write", startIdx: 9, endIdx: 10 },
  { key: "produce", label: "Produce", startIdx: 11, endIdx: 12 },
  { key: "review", label: "Review", startIdx: 13, endIdx: 15 },
];

export type PhaseExtended = Phase & {
  stage: string;
  unlockRequirements?: Record<string, "completed" | "available">;
};

export function phases(storyId: string): PhaseExtended[] {
  const base = `/studio/${storyId}`;
  return [
    { key: "home", title: "Studio Home", href: `${base}/home`, file: "status", description: "Project pulse and next step.", stage: "foundation" },
    { key: "seed", title: "Story Seed", href: `${base}/seed`, file: "master_story.json", description: "Title, idea, genre, ending, foundation.", stage: "foundation" },
    { key: "world", title: "World Core", href: `${base}/world`, file: "master_story.json", description: "World scale, rules, factions, threats.", stage: "foundation", unlockRequirements: { master_story: "completed" } },
    { key: "cast", title: "Cast Forge", href: `${base}/cast`, file: "characters.json", description: "Major character structure, queue, profiles.", stage: "characters", unlockRequirements: { world_core: "completed" } },
    { key: "side", title: "Side Cast", href: `${base}/side`, file: "characters.json", description: "Supporting cast, minor characters, extras.", stage: "characters", unlockRequirements: { characters: "completed" } },
    { key: "web", title: "Relationship Web", href: `${base}/web`, file: "characters.json", description: "Locked until two real profiles exist.", stage: "characters", unlockRequirements: { relationship_map: "available" } },
    { key: "board", title: "Plot Board", href: `${base}/board`, file: "plot_outline.json", description: "Narrative structure, arc, chapters.", stage: "plot", unlockRequirements: { characters: "completed" } },
    { key: "scenes", title: "Scene Cards", href: `${base}/scenes`, file: "plot_outline.json", description: "Scene breakdown grouped by chapter.", stage: "plot", unlockRequirements: { plot_outline: "completed" } },
    { key: "threads", title: "Plot Threads", href: `${base}/threads`, file: "plot_outline.json", description: "Main plot, arcs, relationships, threats, powers.", stage: "plot", unlockRequirements: { plot_outline: "completed" } },
    { key: "desk", title: "Writing Desk", href: `${base}/desk`, file: "plot_workspace.json", description: "Free writing, AI expansion, analysis.", stage: "write", unlockRequirements: { characters: "completed" } },
    { key: "court", title: "Consequence Court", href: `${base}/court`, file: "plot_workspace.json", description: "Questions, answers, confirmation.", stage: "write", unlockRequirements: { plot_workspace: "completed" } },
    { key: "script", title: "Manga Script", href: `${base}/script`, file: "chapter_script.json", description: "Pages, panels, dialogue, approval.", stage: "produce", unlockRequirements: { chapter_script: "available" } },
    // Export unlocks once the plot outline is done. Story-doc / scenes / raw-zip
    // exports work without a generated script; the visuals export is self-gated
    // inside the page so it stays disabled until a script exists.
    { key: "export", title: "Export", href: `${base}/export`, file: "download", description: "Export story as text, Markdown, Word, or ZIP.", stage: "produce", unlockRequirements: { plot_outline: "completed" } },
    { key: "timeline", title: "Memory Timeline", href: `${base}/timeline`, file: "versions", description: "Versions and event history.", stage: "review" },
    { key: "radar", title: "Continuity Radar", href: `${base}/radar`, file: "continuity", description: "Contradictions and warnings.", stage: "review" },
    { key: "control", title: "Control Room", href: `${base}/control`, file: "advanced", description: "Raw API / JSON links.", stage: "review" },
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
