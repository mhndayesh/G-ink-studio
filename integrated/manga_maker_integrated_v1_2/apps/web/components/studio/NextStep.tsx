"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { phases, STAGES, isPhaseUnlocked } from "@/lib/phases";
import { useStudioStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function NextStep() {
  const { storyId } = useParams<{ storyId: string }>();
  const pathname = usePathname();
  const phaseStatuses = useStudioStore((s) => s.phaseStatuses);
  const phaseList = phases(storyId);
  const current = phaseList.find((p) => pathname.includes(`/${p.key}`));
  if (!current) return null;
  const currentIdx = phaseList.indexOf(current);

  let next = null;
  for (let i = currentIdx + 1; i < phaseList.length; i++) {
    if (isPhaseUnlocked(phaseList[i], phaseStatuses)) {
      next = phaseList[i];
      break;
    }
  }

  let prev = null;
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (isPhaseUnlocked(phaseList[i], phaseStatuses)) {
      prev = phaseList[i];
      break;
    }
  }

  const currentStage = STAGES.find((s) => s.key === current.stage);
  const stagePhases = phaseList.filter((p) => p.stage === current.stage);

  return (
    <div className="mt-6 rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-manga-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {prev ? (
          <Link href={prev.href} className="rounded-xl border-2 border-slate-400 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">← {prev.title}</Link>
        ) : <div />}
        <div className="flex items-center gap-2">
          {stagePhases.map((p) => {
            const isActive = p.key === current.key;
            const isNext = next?.key === p.key;
            return (
              <Link key={p.key} href={isPhaseUnlocked(p, phaseStatuses) ? p.href : ""} className={cn(
                "h-2 w-2 rounded-full transition",
                isActive ? "bg-slate-900 scale-125" : isNext ? "bg-amber-400" : !isPhaseUnlocked(p, phaseStatuses) ? "bg-slate-200" : "bg-slate-300 hover:bg-slate-400",
              )} title={p.title} onClick={(e) => { if (!isPhaseUnlocked(p, phaseStatuses)) e.preventDefault(); }} />
            );
          })}
        </div>
        {next ? (
          <Link href={next.href} className="rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800">{next.title} →</Link>
        ) : <span className="text-xs text-slate-400 font-bold">All phases complete</span>}
      </div>
      <div className="mt-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">{currentStage?.label || ""}</div>
    </div>
  );
}
