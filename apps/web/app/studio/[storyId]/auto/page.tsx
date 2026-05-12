"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "@/components/cards/Panel";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { AutoPilot, PHASES, type PhaseKey, type PhaseReport } from "@/lib/autoPilot";

const STATUS_PILL: Record<PhaseReport["status"], { label: string; cls: string }> = {
  pending:  { label: "pending",  cls: "bg-zinc-800 text-zinc-400 border-zinc-700" },
  running:  { label: "running…", cls: "bg-amber-700/40 text-amber-200 border-amber-600 animate-pulse" },
  done:     { label: "done",     cls: "bg-emerald-700/40 text-emerald-200 border-emerald-600" },
  error:    { label: "error",    cls: "bg-red-800/60 text-red-100 border-red-600" },
  skipped:  { label: "skipped",  cls: "bg-zinc-700/60 text-zinc-300 border-zinc-600" },
};

export default function AutoPilotPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const [idea, setIdea] = useState("");
  const [title, setTitle] = useState("");
  const [reports, setReports] = useState<PhaseReport[]>([]);
  const [running, setRunning] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const pilotRef = useRef<AutoPilot | null>(null);

  // Initialise the AutoPilot and read existing phase_status for resume support.
  useEffect(() => {
    if (!storyId) return;
    const pilot = new AutoPilot(storyId, (rs) => setReports([...rs]));
    pilotRef.current = pilot;
    setReports(pilot.getReports());
    pilot.refreshStateFromStatus();
    return () => { pilot.cancel(); };
  }, [storyId]);

  const hasError = reports.some(r => r.status === "error");
  const allDone = reports.length > 0 && reports.every(r => r.status === "done" || r.status === "skipped");

  const totalDone = useMemo(() => reports.filter(r => r.status === "done").length, [reports]);
  const totalSkipped = useMemo(() => reports.filter(r => r.status === "skipped").length, [reports]);
  const totalRunning = useMemo(() => reports.filter(r => r.status === "running").length, [reports]);

  async function handleRun() {
    setGlobalError(null);
    if (!pilotRef.current) return;
    if (!idea.trim()) {
      setGlobalError("Type your idea first — it's the only required input.");
      return;
    }
    setRunning(true);
    try {
      await pilotRef.current.run(idea.trim(), title.trim() || undefined);
    } catch (e: any) {
      setGlobalError(e?.message || "Auto-pilot stopped.");
    } finally {
      setRunning(false);
    }
  }

  async function handleResume() {
    setGlobalError(null);
    if (!pilotRef.current) return;
    setRunning(true);
    try {
      // Find first non-done phase; prefer the one currently in error
      const target = reports.find(r => r.status === "error")?.key
        ?? reports.find(r => r.status !== "done" && r.status !== "skipped")?.key;
      if (!target) return;
      await pilotRef.current.runFromPhase(target);
    } catch (e: any) {
      setGlobalError(e?.message || "Auto-pilot stopped.");
    } finally {
      setRunning(false);
    }
  }

  async function handleRetry(key: PhaseKey) {
    setGlobalError(null);
    if (!pilotRef.current) return;
    setRunning(true);
    try {
      await pilotRef.current.runFromPhase(key);
    } catch (e: any) {
      setGlobalError(e?.message || "Auto-pilot stopped.");
    } finally {
      setRunning(false);
    }
  }

  function handleSkip(key: PhaseKey) {
    pilotRef.current?.skip(key);
  }

  function handleCancel() {
    pilotRef.current?.cancel();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Auto-Pilot</h1>
        <p className="text-sm text-zinc-400 mt-1">
          Drop an idea, click run. The AI walks every phase end-to-end and downloads the export.
          Existing pages stay untouched — this is purely a layer on top.
        </p>
      </div>

      {/* Input */}
      <Panel title="Your idea">
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs font-semibold text-zinc-400">Title (optional)</span>
            <input
              className="mt-1 w-full bg-zinc-800 text-white text-sm p-2 rounded border border-zinc-700"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Leave blank — AI will pick one"
              disabled={running}
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-zinc-400">Story idea *</span>
            <textarea
              className="mt-1 w-full bg-zinc-800 text-white text-sm p-2 rounded border border-zinc-700 min-h-[120px]"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="One paragraph describing your story — characters, setting, hook…"
              disabled={running}
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRun}
              disabled={running || !idea.trim() || allDone}
              className="px-5 py-2 text-sm font-bold rounded bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40"
            >
              {running ? "Running…" : allDone ? "Done — re-run from start?" : "✦ Run Auto-Pilot"}
            </button>
            {(hasError || (!running && reports.some(r => r.status === "pending"))) && !allDone && (
              <button
                onClick={handleResume}
                disabled={running}
                className="px-4 py-2 text-sm rounded bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-40"
              >
                Resume
              </button>
            )}
            {running && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm rounded bg-red-900 hover:bg-red-800 text-white"
              >
                Stop
              </button>
            )}
            <span className="ml-auto text-xs text-zinc-500">
              {totalDone}/{reports.length} done {totalSkipped ? `· ${totalSkipped} skipped` : ""} {totalRunning ? `· 1 running` : ""}
            </span>
          </div>
        </div>
      </Panel>

      <ErrorBanner
        error={globalError ? new Error(globalError) : null}
        onDismiss={() => setGlobalError(null)}
      />

      {/* Progress timeline */}
      <Panel title="Phase timeline">
        <div className="space-y-2">
          {reports.map((r) => {
            const phaseDef = PHASES.find(p => p.key === r.key);
            const pill = STATUS_PILL[r.status];
            const isError = r.status === "error";
            return (
              <div
                key={r.key}
                className={[
                  "border rounded p-3",
                  isError ? "border-red-700 bg-red-900/10" : "border-zinc-700 bg-zinc-900",
                ].join(" ")}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className={["px-2 py-0.5 text-xs rounded border", pill.cls].join(" ")}>
                    {pill.label}
                  </span>
                  <span className="text-sm font-semibold text-white">{r.label}</span>
                  {phaseDef?.targetPage && (
                    <Link
                      href={`/studio/${storyId}/${phaseDef.targetPage}`}
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                      target="_blank"
                    >
                      open page →
                    </Link>
                  )}
                  <span className="ml-auto" />
                  {isError && !running && (
                    <>
                      <button
                        onClick={() => handleRetry(r.key)}
                        className="px-2 py-1 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white"
                      >
                        Retry this phase
                      </button>
                      <button
                        onClick={() => handleSkip(r.key)}
                        className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600 text-white"
                      >
                        Skip
                      </button>
                    </>
                  )}
                </div>

                {r.detail && (
                  <p className="text-xs text-zinc-400 mt-2">{r.detail}</p>
                )}

                {r.error && (
                  <p className="text-xs text-red-300 mt-2 font-mono break-all">{r.error}</p>
                )}

                {r.warnings.length > 0 && (
                  <ul className="text-xs text-amber-300/80 mt-2 list-disc list-inside space-y-0.5">
                    {r.warnings.slice(0, 5).map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                    {r.warnings.length > 5 && (
                      <li className="text-zinc-500">+{r.warnings.length - 5} more</li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {allDone && (
        <Panel title="✓ All done">
          <p className="text-sm text-zinc-300">
            Every phase finished. The triple-zip download should have triggered automatically — if your browser blocked it, open{" "}
            <Link href={`/studio/${storyId}/export`} className="text-indigo-400 underline">Export</Link> and click any download button.
          </p>
        </Panel>
      )}
    </div>
  );
}
