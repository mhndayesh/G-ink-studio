"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { AiButton } from "@/components/forms/AiButton";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { IntegrityLockGate } from "@/components/studio/IntegrityLockGate";

const PANEL_SIZES = ["Small", "Medium", "Large", "Full-Width", "Splash Panel", "Double-Page Spread", "Custom"];
const CAMERA_SHOTS = ["Close-Up", "Extreme Close-Up", "Medium Shot", "Wide Shot", "Over-The-Shoulder", "Low Angle", "High Angle", "Bird's-Eye View", "Worm's-Eye View", "Action Shot", "Reaction Shot", "Establishing Shot", "Custom"];
const PACING_OPTS = ["Fast", "Normal", "Slow", "Dramatic Pause", "Comedic Timing", "Action Burst", "Custom"];
const BUBBLE_TYPES = ["Normal", "Shout", "Whisper", "Thought", "Narration", "Off-Screen", "Monster / Distorted", "Custom"];

// NOTE(dev): Approving a chapter script now triggers create_simple_snapshot() +
// mark_official() via the backend (chapter_script.py approve endpoint).  This freezes
// the approved chapter_script.json (and all other current files) into version history
// so generating the next chapter no longer overwrites the previous one.
// The 'events_extracted' phase is dead — Extract Events button was removed (see note below).
const PHASE_LABEL: Record<string, string> = {
  locked: "Locked",
  ready: "Ready to generate",
  generated: "Generated — review & approve",
  approved: "Approved — version saved",
  events_extracted: "Events extracted (legacy — unused)",
  completed: "Completed",
  historical: "Historical snapshot",
  not_generated: "Not generated",
  loaded_for_editing: "Loaded for editing — edit & re-approve",
};

export default function ScriptPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const qc = useQueryClient();
  const [selectedChapterId, setSelectedChapterId] = useState("");
  const script = useQuery({
    queryKey: ["script", storyId, selectedChapterId],
    queryFn: () => api.getChapterScript(storyId, selectedChapterId),
  });
  const plot = useQuery({ queryKey: ["plotOutline", storyId], queryFn: () => api.getPlotOutline(storyId) });
  const cast = useQuery({ queryKey: ["characters", storyId], queryFn: () => api.getCharacters(storyId) });
  const generate = useMutation({
    mutationFn: (chapterId: string = "") => api.generateChapterScript(storyId, chapterId),
    onSuccess: () => script.refetch(),
  });
  const approve = useMutation({
    mutationFn: () => api.approveChapterScript(storyId, selectedChapterId),
    onSuccess: () => { script.refetch(); qc.invalidateQueries({ queryKey: ["status", storyId] }); },
  });
  // NOTE(dev): extractEvents mutation disabled — the chapter-script event pipeline is orphaned.
  // detected_events_from_script are written to chapter_script.json but never consumed by
  // EventPatchService or VersionService. Event detection + versioning already happens via the
  // Writing Desk → Consequence Court pipeline.
  // const extract = useMutation({ mutationFn: () => api.extractEvents(storyId, selectedChapterId), onSuccess: () => script.refetch() });
  const patch = useMutation({ mutationFn: (body: any) => api.patchChapterScript(storyId, body), onSuccess: () => script.refetch() });
  const chaptersStatus = useQuery({ queryKey: ["chaptersStatus", storyId], queryFn: () => api.getChapterScriptStatuses(storyId) });
  const loadChapter = useMutation({
    mutationFn: (chapterId: string) => api.loadChapterScript(storyId, chapterId),
    onSuccess: () => { script.refetch(); chaptersStatus.refetch(); },
  });

  const content = useMemo(() => (script.data?.content || script.data || {}) as any, [script.data]);
  const unlock = (script.data?.unlock || {}) as any;
  const plotContent = useMemo(() => (plot.data?.content || plot.data || {}) as any, [plot.data]);
  const castContent = (cast.data?.content || cast.data || {}) as any;
  const chapters = useMemo(() => plotContent.chapter_or_episode_list?.chapters || [], [plotContent]);
  const statusMap: Record<string, any> = useMemo(() => {
    const map: Record<string, any> = {};
    for (const ch of (chaptersStatus.data?.chapters || [])) { map[ch.chapter_id] = ch; }
    return map;
  }, [chaptersStatus.data]);
  const selectedStatus = statusMap[selectedChapterId];
  const selectedHasScript = selectedStatus?.has_script || false;
  const speakerOptions: string[] = [
    ...(castContent.created_major_character_profiles || []).map((p: any) => p.character_name).filter(Boolean),
    ...(castContent.created_side_character_profiles || []).map((p: any) => p.character_name).filter(Boolean),
    "Narrator",
  ];
  const pages = content.pages || [];
  const metadata = content.chapter_metadata || {};
  const purpose = content.chapter_purpose || {};
  const scriptSource = script.data?.source || "current";
  const selectedIsCurrent = scriptSource === "current";
  const globalPhase: string = unlock.phase || (pages.length ? "generated" : "ready");
  const currentPhase: string = selectedIsCurrent
    ? (metadata.chapter_status === "loaded_for_editing" ? "loaded_for_editing" : globalPhase)
    : scriptSource === "version_history"
      ? "historical"
      : "not_generated";
  const isLockedPhase = globalPhase === "locked";
  const canApproveSelected =
    selectedIsCurrent &&
    pages.length > 0 &&
    currentPhase !== "approved" &&
    currentPhase !== "events_extracted" &&
    currentPhase !== "completed";
  const selectedIsInHistory = !selectedIsCurrent && selectedHasScript;
  const canLoadSelected = selectedIsInHistory && !selectedIsCurrent;
  // NOTE(dev): Extract Events button removed — pipeline orphaned (see note above).
  // const canExtractSelected = selectedIsCurrent && currentPhase === "approved";

  const [editMode, setEditMode] = useState(false);
  const [chapterTitle, setChapterTitle] = useState("");
  const [showPurpose, setShowPurpose] = useState(false);

  // Generate-All batch state.
  // All LLM calls run in parallel server-side (ThreadPoolExecutor), then chapters are
  // written + approved + snapshotted sequentially. One HTTP call replaces the old loop.
  type BatchPhase = "generating" | "done" | "error";
  const [batch, setBatch] = useState<{ total: number; phase: BatchPhase; processed?: number; failed?: number; syncCount?: number; error?: string } | null>(null);
  const batchCancelRef = useRef<boolean>(false);
  const batchRunning = batch !== null && batch.phase !== "done" && batch.phase !== "error";

  async function runGenerateAll() {
    if (!chapters.length) {
      alert("No chapters to script. Create chapters on Plot Board first.");
      return;
    }
    const todo = [...chapters].sort((a: any, b: any) => (Number(a.chapter_number) || 0) - (Number(b.chapter_number) || 0));
    const confirmed = window.confirm(
      `Regenerate ALL ${todo.length} chapter${todo.length === 1 ? "" : "s"} in parallel?\n\nAll LLM calls run concurrently on the server — much faster than one-by-one.\nThis overwrites every existing script, including already-approved chapters.`
    );
    if (!confirmed) return;

    batchCancelRef.current = false;
    setBatch({ total: todo.length, phase: "generating" });
    try {
      const result = await api.generateBatchApprove(storyId, todo.map((ch: any) => ch.chapter_id));
      const done = result.chapters_processed || 0;
      const failed = result.chapters_failed || 0;
      if (failed > 0) {
        setBatch({ total: todo.length, phase: "error", processed: done, failed, error: `${done} succeeded, ${failed} failed — check the browser console for details.` });
      } else {
        setBatch({ total: todo.length, phase: "done", processed: done, syncCount: result.sync_count });
      }
    } catch (err: any) {
      setBatch({ total: todo.length, phase: "error", error: err?.message || "Batch generation failed" });
    } finally {
      await chaptersStatus.refetch();
      await script.refetch();
    }
  }

  function dismissBatch() {
    setBatch(null);
    batchCancelRef.current = false;
  }

  // Default chapter selection to whatever is currently in the script, or first available.
  useEffect(() => {
    if (!selectedChapterId && chapters.length > 0) {
      setSelectedChapterId(metadata.chapter_id || chapters[0].chapter_id || "");
    }
  }, [chapters, metadata.chapter_id, selectedChapterId]);
  useEffect(() => {
    if (!selectedIsCurrent && editMode) {
      setEditMode(false);
    }
  }, [editMode, selectedIsCurrent]);

  function saveField(targetBranch: string, value: any) {
    if (!selectedIsCurrent) return;
    patch.mutate({ target_branch: targetBranch, operation: "replace", value });
  }

  return (
    <IntegrityLockGate storyId={storyId}>
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Manga Script Studio" subtitle="One chapter at a time: scenes → pages → panels.">
        {batch && (
          <div className={`mb-3 rounded-xl border-2 p-3 sm:p-4 ${batch.phase === "error" ? "border-rose-500 bg-rose-50" : batch.phase === "done" ? "border-emerald-500 bg-emerald-50" : "border-violet-500 bg-violet-50"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-md px-2 py-1 text-xs font-black uppercase tracking-wide text-white ${batch.phase === "error" ? "bg-rose-700" : batch.phase === "done" ? "bg-emerald-700" : "bg-violet-700"}`}>
                  {batch.phase === "done" ? "Done" : batch.phase === "error" ? "Error" : "Running"}
                </span>
                <span className="text-sm font-bold">
                  {batch.phase === "done"
                    ? `Generated & approved ${batch.processed ?? batch.total} chapter${(batch.processed ?? batch.total) === 1 ? "" : "s"}.${batch.syncCount ? ` Created ${batch.syncCount} speaker stub${batch.syncCount === 1 ? "" : "s"}.` : ""}`
                    : batch.phase === "error"
                    ? batch.error || "Generation failed."
                    : `Generating all ${batch.total} chapters in parallel… (LLM calls run concurrently)`}
                </span>
              </div>
              {!batchRunning && (
                <button
                  className="rounded-lg border-2 border-slate-400 bg-white px-3 py-1 text-xs font-black text-slate-600"
                  onClick={dismissBatch}
                >
                  Dismiss
                </button>
              )}
            </div>
            {batchRunning && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-violet-200">
                <div className="h-full bg-violet-600 animate-pulse w-full" />
              </div>
            )}
          </div>
        )}
        {/* Phase indicator + blockers */}
        <div className="mb-3 rounded-xl border-2 border-slate-900 bg-amber-50 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-black uppercase tracking-wide text-white">{currentPhase}</span>
              <span className="text-sm font-bold">{PHASE_LABEL[currentPhase] || currentPhase}</span>
            </div>
            {selectedIsCurrent && unlock.next_method?.label && (
              <span className="text-xs font-bold text-slate-600">→ {unlock.next_method.label}</span>
            )}
          </div>
          {isLockedPhase && unlock.blockers?.length > 0 && (
            <ul className="mt-2 space-y-1">
              {unlock.blockers.map((b: any) => (
                <li key={b.code} className="text-xs">
                  <span className="font-black text-rose-700">🔒 {b.code}</span>
                  <span className="ml-2 text-slate-700">{b.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-slate-500">
            Tip: <strong>generate replaces</strong> the current chapter script. Approve and create a version bundle <em>before</em> generating the next chapter to preserve it in version history.
          </p>
        </div>

        {!selectedIsCurrent && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            {scriptSource === "version_history"
              ? "This chapter was generated and approved in a previous version. Load it back for editing, or keep browsing. Generate Script will OVERWRITE the current working script with a fresh generation from plot data."
              : "This plot chapter exists but has no generated script pages saved. Click Generate Script to create the working script for this selected chapter."}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {chapters.length > 0 && (
            <select
              className="rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-bold sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-w-[200px]"
              value={selectedChapterId}
              onChange={(e) => setSelectedChapterId(e.target.value)}
              disabled={isLockedPhase || batchRunning}
            >
              <option value="">— Select Chapter —</option>
              {chapters.map((ch: any) => {
                const st = statusMap[ch.chapter_id];
                const badge = st?.has_script ? (st?.is_current ? " ✏ current" : " ✓") : "";
                return (
                  <option key={ch.chapter_id} value={ch.chapter_id}>
                    Ch.{ch.chapter_number} — {ch.chapter_title || "Untitled"}{badge}
                  </option>
                );
              })}
            </select>
          )}
          {!selectedIsCurrent && selectedHasScript ? (
            <>
              <button
                className="rounded-xl border-2 border-violet-700 bg-violet-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
                onClick={() => loadChapter.mutate(selectedChapterId)}
                disabled={!canLoadSelected || loadChapter.isPending || batchRunning}
              >
                {loadChapter.isPending ? "Loading..." : "Load & Edit"}
              </button>
              <button
                className="rounded-xl border-2 border-amber-700 bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800 disabled:opacity-40 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
                onClick={() => { if (confirm(`Regenerate chapter ${selectedChapterId}? This replaces the CURRENT working script with a fresh generation from plot data. The version-history snapshot is not deleted.`)) generate.mutate(selectedChapterId); }}
                disabled={isLockedPhase || generate.isPending || batchRunning}
              >
                {generate.isPending ? "Generating..." : "Regenerate"}
              </button>
            </>
          ) : (
            <AiButton label="Generate Script" onClick={() => { if (chapters.length > 0 && !selectedChapterId) { alert("Please select a chapter to generate script for."); return; } generate.mutate(selectedChapterId); }} loading={generate.isPending} disabled={isLockedPhase || batchRunning} />
          )}
          {chapters.length > 1 && (
            <button
              className="rounded-xl border-2 border-violet-700 bg-violet-100 px-4 py-2.5 text-sm font-black text-violet-800 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
              onClick={runGenerateAll}
              disabled={isLockedPhase || generate.isPending || approve.isPending || batchRunning}
              title="Generate every remaining chapter in order, approving each one into version history before moving on."
            >
              ⚡ Generate All
            </button>
          )}
          {selectedIsCurrent && (
            <>
              <button
                className="rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
                onClick={() => approve.mutate()}
                disabled={!canApproveSelected || batchRunning}
              >
                Approve Script
              </button>
              <button
                className={`rounded-xl border-2 px-4 py-2.5 text-sm font-black sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base transition ${editMode ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-400 bg-white text-slate-600"}`}
                onClick={() => setEditMode(!editMode)}
                disabled={batchRunning}
              >
                {editMode ? "✏ Editing (on)" : "Edit Mode"}
              </button>
            </>
          )}
        </div>
        {loadChapter.isError && <div className="mt-2"><ErrorBanner error={loadChapter.error as Error} /></div>}
        {generate.isError && <div className="mt-2"><ErrorBanner error={generate.error as Error} /></div>}
        {approve.isError && <div className="mt-2"><ErrorBanner error={approve.error as Error} /></div>}
        {/* NOTE(dev): extract error display removed — extractEvents mutation is disabled (see note above). */}
        {/* {extract.isError && <div className="mt-2"><ErrorBanner error={extract.error as Error} /></div>} */}
        {patch.isError && <div className="mt-2"><ErrorBanner error={patch.error as Error} /></div>}

        {/* Chapter Metadata — uses real paths under chapter_metadata */}
        {pages.length > 0 && (
          <div className="mt-4 rounded-xl border-2 border-slate-900 bg-white p-3 sm:rounded-2xl sm:p-4">
            <h3 className="font-black">Chapter Metadata</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {editMode ? (
                <Field
                  label="Chapter title"
                  value={chapterTitle || metadata.chapter_title || ""}
                  onChange={(v) => { setChapterTitle(v); saveField("chapter_metadata.chapter_title", v); }}
                />
              ) : (
                <div className="sm:col-span-2 flex flex-wrap gap-3">
                  <span className="font-bold">Ch.{metadata.chapter_number ?? "?"} — {metadata.chapter_title || "Untitled Chapter"}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold">{metadata.chapter_status || "draft"}</span>
                  {metadata.generation_source && (
                    <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                      {metadata.generation_source === "workspace_expansion" ? "from Writing Desk" : "from Plot Outline"}
                    </span>
                  )}
                </div>
              )}
            </div>
            <button className="mt-2 text-xs font-bold text-slate-500 underline" onClick={() => setShowPurpose(!showPurpose)}>
              {showPurpose ? "Hide" : "Show"} Chapter Purpose
            </button>
            {showPurpose && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {Object.keys(purpose).length > 0 ? (
                  Object.entries(purpose).map(([k, v]) => (
                    <Field
                      key={k}
                      label={k.replace(/_/g, " ")}
                      value={typeof v === "string" ? v : JSON.stringify(v)}
                      onChange={(val) => editMode && saveField(`chapter_purpose.${k}`, val)}
                    />
                  ))
                ) : (
                  <span className="text-xs text-slate-500">Chapter purpose is empty. Regenerate the script to populate it from the plot outline.</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Pages and Panels */}
        <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4">
          {pages.length > 0 ? pages.map((page: any, pageIdx: number) => (
            <div key={page.page_id} className="rounded-xl border-2 border-slate-900 bg-white p-3 sm:rounded-2xl sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-black">Page {page.page_number}</h3>
                {editMode && (
                  <div className="flex gap-2">
                    <input className="w-32 rounded-lg border-2 border-slate-300 px-2 py-1 text-xs" value={page.page_purpose || ""} onChange={(e) => saveField(`pages[${pageIdx}].page_purpose`, e.target.value)} placeholder="Page purpose" />
                    <input className="w-24 rounded-lg border-2 border-slate-300 px-2 py-1 text-xs" value={page.page_mood || ""} onChange={(e) => saveField(`pages[${pageIdx}].page_mood`, e.target.value)} placeholder="Page mood" />
                  </div>
                )}
              </div>
              <div className="mt-2 grid gap-2 sm:mt-3 sm:grid-cols-2 sm:gap-3">
                {(page.panels || []).map((panel: any, panelIdx: number) => (
                  <div key={panel.panel_id} className="rounded-lg border-2 border-slate-900 bg-[#fffaf0] p-2.5 sm:rounded-xl sm:p-3">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-sm font-black">Panel {panel.panel_number}</span>
                      {panel.panel_size?.selected && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold">{panel.panel_size.selected}</span>}
                    </div>

                    {/* Panel Controls (edit mode) */}
                    {editMode && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <select className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold" value={panel.panel_size?.selected || ""} onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].panel_size.selected`, e.target.value)}>
                          <option value="">Size</option>
                          {PANEL_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold" value={panel.camera_shot?.selected || ""} onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].camera_shot.selected`, e.target.value)}>
                          <option value="">Camera</option>
                          {CAMERA_SHOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-bold" value={panel.pacing?.selected || ""} onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].pacing.selected`, e.target.value)}>
                          <option value="">Pacing</option>
                          {PACING_OPTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {panel.panel_size?.selected === "Custom" && <input className="w-20 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px]" value={panel.panel_size?.custom_panel_size || ""} onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].panel_size.custom_panel_size`, e.target.value)} placeholder="Custom size" />}
                        {panel.camera_shot?.selected === "Custom" && <input className="w-20 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px]" value={panel.camera_shot?.custom_camera_shot || ""} onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].camera_shot.custom_camera_shot`, e.target.value)} placeholder="Custom cam" />}
                        {panel.pacing?.selected === "Custom" && <input className="w-20 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px]" value={panel.pacing?.custom_pacing || ""} onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].pacing.custom_pacing`, e.target.value)} placeholder="Custom pace" />}
                      </div>
                    )}

                    {/* Visual Description */}
                    {editMode ? (
                      <textarea
                        className="mt-2 w-full rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-xs resize-y min-h-[60px]"
                        value={panel.visual || ""}
                        onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].visual`, e.target.value)}
                        placeholder="Panel visual description..."
                      />
                    ) : (
                      <p className="mt-1 text-xs sm:text-sm">{panel.visual || "No visual written yet."}</p>
                    )}

                    {/* Character Action */}
                    {editMode && panel.character_action !== undefined && (
                      <textarea
                        className="mt-1 w-full rounded-lg border-2 border-slate-300 bg-white px-2 py-1.5 text-xs resize-y min-h-[40px]"
                        value={panel.character_action || ""}
                        onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].character_action`, e.target.value)}
                        placeholder="Character action..."
                      />
                    )}

                    {/* Narration (caption box) */}
                    {(editMode || panel.narration) && (
                      <div className="mt-1.5">
                        {editMode ? (
                          <input
                            className="w-full rounded border border-slate-300 bg-amber-50 px-2 py-1 text-xs italic"
                            value={panel.narration || ""}
                            onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].narration`, e.target.value)}
                            placeholder="Narration / caption box..."
                          />
                        ) : (
                          panel.narration && <p className="rounded bg-amber-50 px-2 py-1 text-xs italic">📝 {panel.narration}</p>
                        )}
                      </div>
                    )}

                    {/* Dialogue — speaker_name is the canonical field; speech_bubble_type controls style */}
                    {panel.dialogue && panel.dialogue.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {panel.dialogue.map((d: any, dIdx: number) => {
                          const speaker = d.speaker_name || d.speaker || "";
                          const bubble = d.speech_bubble_type?.selected || "Normal";
                          return (
                            <div key={dIdx} className="flex items-start gap-1.5">
                              {editMode ? (
                                <>
                                  <select
                                    className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-bold w-24"
                                    value={speaker}
                                    onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].dialogue[${dIdx}].speaker_name`, e.target.value)}
                                  >
                                    <option value="">Speaker</option>
                                    {speakerOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  <select
                                    className="rounded border border-slate-300 bg-white px-1 py-0.5 text-[10px] font-bold w-20"
                                    value={bubble}
                                    onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].dialogue[${dIdx}].speech_bubble_type.selected`, e.target.value)}
                                  >
                                    {BUBBLE_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
                                  </select>
                                  <input
                                    className="flex-1 rounded border border-slate-300 bg-white px-2 py-0.5 text-xs"
                                    value={d.text || ""}
                                    onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].dialogue[${dIdx}].text`, e.target.value)}
                                    placeholder="Dialogue text..."
                                  />
                                </>
                              ) : (
                                <div className="flex items-center gap-1.5 w-full">
                                  <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">{speaker || "?"}:</span>
                                  <span className={`text-xs italic rounded px-2 py-0.5 ${bubble === "Shout" ? "bg-rose-100 font-black" : bubble === "Thought" ? "bg-blue-100" : bubble === "Whisper" ? "bg-slate-100 text-slate-500" : "bg-slate-100"}`}>
                                    {d.text || ""}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* SFX — template stores objects {sfx_text, sfx_meaning, sfx_style_note} */}
                    {panel.sound_effects && panel.sound_effects.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {panel.sound_effects.map((sfx: any, sfxIdx: number) => {
                          const sfxText = typeof sfx === "string" ? sfx : (sfx.sfx_text || sfx.text || "");
                          return editMode ? (
                            <input
                              key={sfxIdx}
                              className="w-24 rounded border-2 border-orange-300 bg-orange-50 px-2 py-0.5 text-[10px] font-bold"
                              value={sfxText}
                              onChange={(e) => saveField(`pages[${pageIdx}].panels[${panelIdx}].sound_effects[${sfxIdx}].sfx_text`, e.target.value)}
                              placeholder="SFX"
                              title={sfx.sfx_meaning || ""}
                            />
                          ) : (
                            <span
                              key={sfxIdx}
                              className="rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-700"
                              title={sfx.sfx_meaning || ""}
                            >
                              💥 {sfxText}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )) : (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              {isLockedPhase ? (
                <>
                  <p className="text-sm font-black text-rose-700">🔒 Locked</p>
                  <p className="mt-1 text-xs text-slate-600">Resolve the blockers above to unlock the panel.</p>
                </>
              ) : (
                <p className="text-sm font-bold text-slate-500">
                  {currentPhase === "not_generated"
                    ? "This plot chapter is present, but no script pages are saved for it yet. Click Generate Script to create them."
                    : "No pages generated yet. Pick a chapter and click Generate Script."}
                </p>
              )}
            </div>
          )}
        </div>
      </Panel>
      <Panel title="chapter_script.json"><StructuredJsonView data={content} /></Panel>
    </div>
    </IntegrityLockGate>
  );
}
