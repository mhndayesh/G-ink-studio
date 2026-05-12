"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Activity, Database, ShieldCheck, Sparkles, ChevronDown, Menu, X, LayoutDashboard, BookText, Users, MapPin, PenTool, Film, Search, Lock, CheckCircle, Network, Braces, AlertTriangle } from "lucide-react";
import { phases, STAGES, isPhaseUnlocked } from "@/lib/phases";
import { NextStep } from "./NextStep";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useStudioStore } from "@/lib/store";

const STAGE_COLORS: Record<string, string> = {
  foundation: "border-l-amber-500 bg-amber-50/40",
  characters: "border-l-indigo-500 bg-indigo-50/40",
  plot: "border-l-emerald-500 bg-emerald-50/40",
  write: "border-l-violet-500 bg-violet-50/40",
  produce: "border-l-rose-500 bg-rose-50/40",
  review: "border-l-slate-500 bg-slate-50/40",
};

const STAGE_ICONS: Record<string, React.ReactNode> = {
  foundation: <BookText size={14} />,
  characters: <Users size={14} />,
  plot: <MapPin size={14} />,
  write: <PenTool size={14} />,
  produce: <Film size={14} />,
  review: <Search size={14} />,
};

export function StudioShell({ storyId, children }: { storyId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const phaseList = phases(storyId);
  const active = phaseList.find((p) => pathname.includes(`/${p.key}`)) || phaseList[0];
  const activeStage = active?.stage || "foundation";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const phaseStatuses = useStudioStore((s) => s.phaseStatuses);
  const setPhaseStatuses = useStudioStore((s) => s.setPhaseStatuses);
  const integrityLock = useStudioStore((s) => s.integrityLock);
  const setIntegrityLock = useStudioStore((s) => s.setIntegrityLock);

  useEffect(() => {
    // Refetch phase_status whenever the user moves to a different studio
    // page. Without this, locks computed at first mount stay stale even
    // after the user fills in the prerequisites that would unlock the next
    // phase (e.g. adding scenes/threads should immediately make Manga
    // Script unlock instead of requiring a hard reload).
    api.storyStatus(storyId).then((s) => {
      if (s?.phase_status) setPhaseStatuses(s.phase_status);
      if (s?.integrity_lock) setIntegrityLock(s.integrity_lock);
    }).catch(() => {});
  }, [storyId, pathname, setPhaseStatuses, setIntegrityLock]);

  // Route guard — redirect if current phase is locked
  useEffect(() => {
    if (Object.keys(phaseStatuses).length === 0) return;
    if (!active || active.key === "home") return;
    if (!isPhaseUnlocked(active, phaseStatuses)) {
      router.replace(`/studio/${storyId}/home`);
    }
  }, [active, phaseStatuses, storyId, router]);

  function getLockedReason(phase: ReturnType<typeof phases>[0]): string | null {
    if (isPhaseUnlocked(phase, phaseStatuses)) return null;
    const reqs = phase.unlockRequirements;
    if (!reqs) return null;
    const blockerLabels: Record<string, string> = {
      plot_outline_missing: "Create chapters on Plot Board",
      story_integrity_locked: "Resolve the Story Integrity Lock",
      plot_threads_empty: "Fill plot threads (main goal, arcs, etc.)",
      no_chapters: "Create at least one chapter",
      no_scenes: "Create at least one scene card",
    };
    const phaseLabels: Record<string, string> = {
      master_story: "Story Seed",
      world_core: "World Core",
      characters: "Cast Forge",
      plot_outline: "Plot Board (chapters + structure)",
      plot_workspace: "Writing Desk (write + analyze)",
      relationship_map: "2+ major character profiles",
      chapter_script: "Manga Script (generate + approve)",
    };
    for (const [key, needed] of Object.entries(reqs)) {
      const actual = phaseStatuses[key];
      if (needed === "available") {
        if (!actual || actual === "locked") {
          // For chapter_script, the API also provides the exact blockers list.
          if (key === "chapter_script") {
            const raw = String(phaseStatuses["chapter_script_unlock_blockers"] || "").trim();
            const blockers = raw ? raw.split(",").map((b) => blockerLabels[b] || b).filter(Boolean) : [];
            if (blockers.length > 0) return `Locked: ${blockers.join(" • ")}`;
          }
          return `Complete ${phaseLabels[key] || key} first`;
        }
      } else if (actual !== needed) {
        return `Complete ${phaseLabels[key] || key} first`;
      }
    }
    return "Locked";
  }

  return (
    <main className="min-h-screen paper-grid">
      <header className="sticky top-0 z-30 border-b-2 border-slate-900 bg-[#fbf7ef]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-5 sm:py-3">
          <Link href={`/studio/${storyId}/home`} className="flex items-center gap-2 font-black tracking-tight text-lg sm:text-xl shrink-0">
            <LayoutDashboard size={22} /> Manga Studio
          </Link>
          <div className="hidden items-center gap-2 md:flex">
            <StatusPill icon={<Database size={14} />} label="v001+" />
            <StatusPill icon={<ShieldCheck size={14} />} label="template" />
            <StatusPill icon={<Activity size={14} />} label="Synced" />
            <GraphPill storyId={storyId} />
            <VectorPill storyId={storyId} />
            <LlmPill />
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <LlmPill compact />
            <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="rounded-xl border-2 border-slate-900 bg-white p-2" aria-label="Toggle navigation">
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {integrityLock?.locked && (
        <div className="border-b-2 border-amber-400 bg-amber-50 px-4 py-2.5 sm:px-5">
          <div className="mx-auto flex max-w-7xl items-center gap-2.5 text-amber-900">
            <AlertTriangle size={16} className="shrink-0 text-amber-600" />
            <span className="text-xs font-black uppercase tracking-wider text-amber-700">Story Locked —</span>
            <span className="text-xs font-semibold">
              Chapter {integrityLock.deleted_chapter_number}
              {integrityLock.deleted_chapter_title ? ` "${integrityLock.deleted_chapter_title}"` : ""} was deleted.
              {" "}Restore {integrityLock.chapters_to_restore.length} chapter{integrityLock.chapters_to_restore.length !== 1 ? "s" : ""} in the Plot Board to unlock.
            </span>
            <Link href={`/studio/${storyId}/board`} className="ml-auto shrink-0 rounded-lg border-2 border-amber-500 bg-white px-2.5 py-1 text-[11px] font-black text-amber-700 hover:bg-amber-100">
              Go to Plot Board →
            </Link>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-7xl px-3 py-4 sm:px-5 sm:py-5">
        {/* Desktop nav — stage grouped */}
        <div className="mb-4 hidden md:block">
          <div className="rounded-studio border-2 border-slate-900 bg-white/75 p-2.5 shadow-manga overflow-x-auto">
            <div className="flex gap-6">
              {STAGES.map((stage) => {
                const stagePhases = phaseList.filter((p) => p.stage === stage.key);
                const hasActive = activeStage === stage.key;
                return (
                  <div key={stage.key} className="flex-shrink-0 min-w-0">
                    <div className={cn("flex items-center gap-1 px-2 pb-1 text-[10px] font-black uppercase tracking-wider", hasActive ? "text-slate-900" : "text-slate-400")}>
                      {STAGE_ICONS[stage.key]} {stage.label}
                    </div>
                    <div className="flex gap-1.5">
                      {stagePhases.map((phase) => {
                        const selected = phase.key === active.key;
                        const locked = !selected && !isPhaseUnlocked(phase, phaseStatuses);
                        const completed = phaseStatuses[phase.key] === "completed" || phaseStatuses[phase.key] === "approved";
                        const lockReason = getLockedReason(phase);
                        return (
                          <span key={phase.key} className="shrink-0" title={locked ? lockReason || "Locked" : undefined}>
                            {locked ? (
                              <motion.div className={cn(
                                "relative rounded-2xl border-2 border-slate-300 px-2.5 py-2 transition min-w-[90px] max-w-[140px]",
                                "bg-slate-100 text-slate-400 cursor-not-allowed opacity-50",
                              )}>
                                <div className="flex items-center gap-1 text-[10px] font-bold">
                                  <Lock size={10} className="text-slate-400" />
                                  {phase.title}
                                </div>
                                <div className="mt-0.5 truncate text-[9px] opacity-40">{phase.file}</div>
                              </motion.div>
                            ) : (
                              <Link href={phase.href}>
                                <motion.div whileHover={{ y: -2 }} className={cn(
                                  "relative rounded-2xl border-2 border-slate-900 px-2.5 py-2 transition min-w-[90px] max-w-[140px]",
                                  selected ? "bg-slate-900 text-white" : "bg-[#fffaf0] hover:bg-white",
                                  !selected && STAGE_COLORS[stage.key],
                                )}>
                                  <div className="flex items-center gap-1 text-[10px] font-bold opacity-70">
                                    {completed && !selected && <CheckCircle size={10} className="text-emerald-500" />}
                                    {!completed && phase.key === "web" && !selected && <Lock size={10} className="text-amber-600" />}
                                    {phase.title}
                                  </div>
                                  <div className="mt-0.5 truncate text-[9px] opacity-50">{phase.file}</div>
                                </motion.div>
                              </Link>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mobile nav — stage dropdown */}
        <div className="mb-4 md:hidden">
          <button onClick={() => setMobileNavOpen(!mobileNavOpen)} className="flex w-full items-center justify-between rounded-studio border-2 border-slate-900 bg-white/80 px-4 py-3 font-black shadow-manga-sm">
            <span className="flex items-center gap-2">
              {STAGE_ICONS[activeStage]}
              <span className="text-xs opacity-60">{active.title}</span>
            </span>
            <ChevronDown size={18} className={cn("transition-transform", mobileNavOpen && "rotate-180")} />
          </button>
          <AnimatePresence>
            {mobileNavOpen && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-b-studio border-2 border-t-0 border-slate-900 bg-white">
                <div className="space-y-3 p-3">
                  {STAGES.map((stage) => {
                    const stagePhases = phaseList.filter((p) => p.stage === stage.key);
                    return (
                      <div key={stage.key}>
                        <div className="flex items-center gap-1 px-1 pb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          {STAGE_ICONS[stage.key]} {stage.label}
                        </div>
                        <div className="grid grid-cols-2 gap-1">
                          {stagePhases.map((phase) => {
                            const selected = phase.key === active.key;
                            const locked = !selected && !isPhaseUnlocked(phase, phaseStatuses);
                            const completed = phaseStatuses[phase.key] === "completed" || phaseStatuses[phase.key] === "approved";
                            const lockReason = getLockedReason(phase);
                            if (locked) {
                              return (
                                <span key={phase.key} className="rounded-xl border-2 border-slate-300 px-2.5 py-2 text-sm font-bold text-slate-400 bg-slate-100 cursor-not-allowed opacity-50 flex items-center gap-1" title={lockReason || "Locked"}>
                                  <Lock size={12} />
                                  {phase.title}
                                </span>
                              );
                            }
                            return (
                              <Link key={phase.key} href={phase.href} onClick={() => setMobileNavOpen(false)} className={cn("rounded-xl border-2 border-slate-900 px-2.5 py-2 text-sm font-bold transition flex items-center gap-1", selected ? "bg-slate-900 text-white" : "bg-[#fffaf0]")}>
                                {completed && !selected && <CheckCircle size={12} className="text-emerald-500" />}
                                {!completed && phase.key === "web" && !selected && <Lock size={12} className="text-amber-600" />}
                                {phase.title}
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.div key={pathname} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
          {children}
          <NextStep />
        </motion.div>
      </section>
    </main>
  );
}

/* ─── Sub-components ─────── */
function StatusPill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-slate-900 bg-white px-2.5 py-1 text-xs font-bold">{icon}{label}</span>;
}

function LlmPill({ compact }: { compact?: boolean }) {
  const { data: status } = useQuery({ queryKey: ["llmStatus"], queryFn: () => api.getLlmStatus() });
  const isReal = status?.real_llm_ready;
  const iconColor = isReal ? "text-emerald-500" : "text-violet-500";
  const dotClass = isReal ? "dot ready bg-emerald-500" : "dot fallback";
  const textColor = isReal ? "text-emerald-700" : "text-violet-700";
  const borderBg = isReal ? "border-emerald-200 bg-emerald-50/50" : "border-violet-200 bg-violet-50/50";
  return <span className={`llm-pill inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-bold ${borderBg}`}>
    <Sparkles size={13} className={iconColor} />
    <span className={dotClass} />
    {!compact && <span className={textColor}>{isReal ? "LLM Ready" : "LLM Fallback"}</span>}
  </span>;
}

function GraphPill({ storyId }: { storyId: string }) {
  const { data: status } = useQuery({ queryKey: ["graphStatus", storyId], queryFn: () => api.getGraphStatus(storyId), enabled: !!storyId });
  const connected = status?.enabled && (status?.connected ?? status?.can_connect);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-bold ${connected ? "border-emerald-200 bg-emerald-50/50 text-emerald-700" : "border-slate-200 bg-slate-50/50 text-slate-500"}`}>
      <Network size={13} className={connected ? "text-emerald-500" : "text-slate-400"} />
      {connected ? "Graph On" : "Graph Off"}
    </span>
  );
}

function VectorPill({ storyId }: { storyId: string }) {
  const { data: status } = useQuery({ queryKey: ["vectorStatus", storyId], queryFn: () => api.getVectorStatus(storyId), enabled: !!storyId });
  const connected = status?.enabled && (status?.connected ?? status?.can_connect);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-xs font-bold ${connected ? "border-indigo-200 bg-indigo-50/50 text-indigo-700" : "border-slate-200 bg-slate-50/50 text-slate-500"}`}>
      <Braces size={13} className={connected ? "text-indigo-500" : "text-slate-400"} />
      {connected ? "Vector On" : "Vector Off"}
    </span>
  );
}
