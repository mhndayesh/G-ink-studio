"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useStudioStore } from "@/lib/store";

interface IntegrityLockGateProps {
  storyId: string;
  children: React.ReactNode;
}

/**
 * Wraps a page's interactive content. When the story has an active integrity
 * lock the children are replaced by a blocking lock screen that directs the
 * user to the Plot Board to restore missing chapters first.
 */
export function IntegrityLockGate({ storyId, children }: IntegrityLockGateProps) {
  const lock = useStudioStore((s) => s.integrityLock);

  if (!lock?.locked) return <>{children}</>;

  const toRestore = lock.chapters_to_restore ?? [];
  const restored = lock.chapters_restored ?? [];
  const total = toRestore.length + restored.length;
  const done = restored.length;

  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-6 shadow-[3px_3px_0_0_#b45309]">
      <div className="flex items-start gap-3">
        <AlertTriangle size={24} className="mt-0.5 shrink-0 text-amber-500" />
        <div className="flex-1">
          <h2 className="font-black text-xl text-amber-900">Story Locked</h2>
          <p className="mt-1 text-sm text-amber-800">
            Chapter {lock.deleted_chapter_number}
            {lock.deleted_chapter_title ? ` &ldquo;${lock.deleted_chapter_title}&rdquo;` : ""} was deleted.
            The story must be restored before writing or scripting can continue.
          </p>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs font-bold text-amber-700">
              <span>Restore progress</span>
              <span>{done} / {total} chapters</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full border border-amber-300 bg-amber-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
              />
            </div>
          </div>

          {/* Step list */}
          <div className="mt-4 space-y-1.5">
            {[...restored, ...toRestore].map((num, i) => {
              const isDone = restored.includes(num);
              const isCurrent = !isDone && toRestore[0] === num;
              return (
                <div key={num} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isDone ? "border-emerald-300 bg-emerald-50" : isCurrent ? "border-amber-400 bg-white font-bold" : "border-slate-200 bg-slate-50 opacity-50"}`}>
                  <span className={isDone ? "text-emerald-500" : isCurrent ? "text-amber-500" : "text-slate-400"}>
                    {isDone ? "✓" : isCurrent ? "→" : `${i + 1}.`}
                  </span>
                  <span className={isDone ? "text-emerald-700 line-through" : "text-slate-800"}>
                    Chapter {num}
                    {num === lock.deleted_chapter_number && !isDone && <span className="ml-1.5 text-xs text-red-600">(must recreate)</span>}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-5">
            <Link
              href={`/studio/${storyId}/board`}
              className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-600 bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700"
            >
              Go to Plot Board — Restore Chapters →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
