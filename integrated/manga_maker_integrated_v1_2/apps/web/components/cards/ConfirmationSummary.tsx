"use client";

import { FileText, GitBranch, ArrowRight, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

const EVENT_ICONS: Record<string, string> = {
  CHARACTER_INJURED: "\u{1F915}",
  CHARACTER_ATTACKED_CHARACTER: "\u2694\uFE0F",
  CHARACTER_ALLEGIANCE_CHANGED_OR_REVEALED: "\u{1F575}\uFE0F",
  PLOT_INPUT_REVIEWED: "\u{1F4DD}",
};

const FILE_LABELS: Record<string, string> = {
  master_story: "Master Story",
  characters: "Characters",
  plot_outline: "Plot Outline",
  plot_workspace: "Plot Workspace",
  chapter_script: "Chapter Script",
  memory_system: "Memory System",
  relationship_map: "Relationship Map",
};

const OPERATION_LABELS: Record<string, string> = {
  replace: "Replace",
  add: "Add",
  remove: "Remove",
  append_to_array: "Append to",
  merge_object: "Merge into",
};

export function ConfirmationSummary({ data }: { data: any }) {
  if (!data) return null;

  const notReady = data?.status === "not_ready" || data?.not_ready;
  if (notReady) {
    return (
      <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-amber-800 font-black">
          <AlertTriangle size={18} /> Not Ready
        </div>
        <p className="mt-1 text-sm text-amber-700">
          {data.unanswered_questions_count != null
            ? `${data.unanswered_questions_count} question${data.unanswered_questions_count !== 1 ? "s" : ""} still need answering.`
            : "Confirmation is not ready yet. Answer all consequence questions first."}
        </p>
      </div>
    );
  }

  const cd = data?.content || data;
  const events = cd?.proposed_official_events || cd?.proposed_events || [];
  const patches = cd?.proposed_json_patches || [];
  const summary = cd?.summary_of_detected_changes || cd?.summary || [];
  const approved = cd?.final_confirmation?.status === "approved" || cd?.status === "approved";
  const rejected = cd?.final_confirmation?.status === "rejected" || cd?.status === "rejected";

  if (approved) {
    return (
      <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-emerald-800 font-black">
          <CheckCircle size={18} /> Workspace Approved
        </div>
        <p className="mt-1 text-sm text-emerald-700">Workspace reviewed. Proceed to Manga Script to generate and approve chapter scripts.</p>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 sm:p-5">
        <div className="flex items-center gap-2 text-red-800 font-black">
          <XCircle size={18} /> Changes Rejected
        </div>
        <p className="mt-1 text-sm text-red-700">You can return to the Writing Desk to revise your writing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      {Array.isArray(summary) && summary.length > 0 && (
        <div className="rounded-xl border-2 border-slate-900 bg-white p-3 sm:p-4">
          <h3 className="font-black text-sm">Summary of Changes</h3>
          <ul className="mt-2 space-y-1">
            {summary.map((s: any, i: number) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-amber-500">{EVENT_ICONS[s.event_type] || "\u2022"}</span>
                <span className="text-slate-700">{typeof s === "string" ? s : s.summary || s.event_type || JSON.stringify(s)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Proposed Events */}
      {events.length > 0 && (
        <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-3 sm:p-4">
          <h3 className="flex items-center gap-2 font-black text-sm text-violet-800">
            <GitBranch size={16} /> Proposed Events ({events.length})
          </h3>
          <div className="mt-2 space-y-2">
            {events.map((evt: any, i: number) => (
              <div key={evt.event_id || i} className="rounded-lg border border-violet-200 bg-white p-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{EVENT_ICONS[evt.event_type] || "\u{1F4CC}"}</span>
                  <span className="text-xs font-bold text-violet-700">{evt.event_type || "Event"}</span>
                  <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">{evt.event_category || evt.category || ""}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600">{evt.suggested_event_summary || evt.summary || ""}</p>
                {evt.target_entity_name && (
                  <p className="mt-0.5 text-[10px] text-slate-400">Affects: {evt.target_entity_name}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Proposed Patches */}
      {Array.isArray(patches) && patches.length > 0 && (
        <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 sm:p-4">
          <h3 className="flex items-center gap-2 font-black text-sm text-emerald-800">
            <FileText size={16} /> Proposed Patches ({patches.length})
          </h3>
          <div className="mt-2 space-y-1.5">
            {patches.map((patch: any, i: number) => {
              const op = patch.operation || "replace";
              return (
                <div key={patch.patch_id || i} className="rounded-lg border border-emerald-200 bg-white p-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">{FILE_LABELS[patch.target_file] || patch.target_file}</span>
                    <span className="text-[10px] text-slate-400">
                      <ArrowRight size={10} className="inline" />
                    </span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{OPERATION_LABELS[op] || op}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 font-mono truncate">{patch.target_branch || ""}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
