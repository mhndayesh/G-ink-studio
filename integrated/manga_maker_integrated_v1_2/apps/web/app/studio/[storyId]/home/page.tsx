"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { phases, STAGES, isPhaseUnlocked } from "@/lib/phases";
import { Panel } from "@/components/cards/Panel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { cn } from "@/lib/utils";
import { useStudioStore } from "@/lib/store";

const STAGE_COLORS: Record<string, string> = {
  foundation: "border-amber-500 bg-amber-50",
  characters: "border-indigo-500 bg-indigo-50",
  plot: "border-emerald-500 bg-emerald-50",
  write: "border-violet-500 bg-violet-50",
  produce: "border-rose-500 bg-rose-50",
  review: "border-slate-500 bg-slate-50",
};

export default function HomePage() {
  const { storyId } = useParams<{ storyId: string }>();
  const status = useQuery({ queryKey: ["status", storyId], queryFn: () => api.storyStatus(storyId) });
  const files = useQuery({ queryKey: ["files", storyId], queryFn: () => api.currentFiles(storyId) });
  const phaseList = phases(storyId);
  const phaseStatuses = useStudioStore((s) => s.phaseStatuses);
  const setPhaseStatuses = useStudioStore((s) => s.setPhaseStatuses);

  useEffect(() => {
    if (status.data?.phase_status) {
      setPhaseStatuses(status.data.phase_status);
    }
  }, [status.data, setPhaseStatuses]);

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Studio Home" subtitle="Project pulse, grouped by creative stage.">
        <div className="space-y-5">
          {STAGES.map((stage) => {
            const stagePhases = phaseList.filter((p) => p.stage === stage.key);
            return (
              <div key={stage.key} className={cn("rounded-2xl border-2 p-3 sm:p-4", STAGE_COLORS[stage.key])}>
                <h3 className="text-xs font-black uppercase tracking-wider mb-2">{stage.label}</h3>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {stagePhases.map((phase) => {
                    const locked = !isPhaseUnlocked(phase, phaseStatuses);
                    const completed = phaseStatuses[phase.key] === "completed" || phaseStatuses[phase.key] === "approved";
                    const inner = (
                      <div className={cn("rounded-xl border-2 p-3 transition sm:rounded-2xl sm:p-4",
                        locked ? "border-slate-300 bg-slate-100 opacity-50 cursor-not-allowed" : "border-slate-900 bg-white hover:-translate-y-1 hover:shadow-manga",
                      )}>
                        <div className="text-[10px] font-black uppercase text-amber-700">{phase.file}</div>
                        <div className="mt-1 text-base font-black flex items-center gap-2">
                          {completed ? <span className="text-emerald-500 text-sm">✓</span> : null}
                          {locked ? <span className="text-slate-400 text-sm">🔒</span> : null}
                          {phase.title}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">{phase.description}</div>
                      </div>
                    );
                    if (locked) return <span key={phase.key}>{inner}</span>;
                    return <Link href={phase.href} key={phase.key}>{inner}</Link>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel title="Backend State" subtitle="Live backend response.">
        {status.isLoading ? <div className="h-20 rounded-xl bg-slate-100 loading-shimmer" /> : <StructuredJsonView data={{ status: status.data, files: files.data }} />}
      </Panel>
    </div>
  );
}
