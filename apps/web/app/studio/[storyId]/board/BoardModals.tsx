"use client";

// Board screen modal/dialog components, lifted out of page.tsx. Presentational —
// all state and mutations live in the parent (page.tsx) and are passed in.

import { Field } from "@/components/forms/Field";
import { CustomInput } from "@/components/forms/CustomInput";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

type Beat = { key: string; label: string; purpose: string };
type FormUpdater = (updater: (f: any) => any) => void;

export function ChapterModal({
  form, setForm, structureBeats, refData, arcTitle, arcLengthSelected,
  onSubmit, submitPending, submitError, onClose,
}: {
  form: any;
  setForm: FormUpdater;
  structureBeats: Beat[];
  refData: any;
  arcTitle: string;
  arcLengthSelected: boolean;
  onSubmit: () => void;
  submitPending: boolean;
  submitError: Error | null;
  onClose: () => void;
}) {
  return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => onClose()}>
              <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border-2 border-slate-900 bg-white p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-black text-lg">{form.chapter_id ? `Edit Chapter: ${form.chapter_id}` : "Create Chapter"}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-black">Arc</label>
                    <select className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" value={form.arc_title} onChange={(e) => setForm((f) => ({ ...f, arc_title: e.target.value }))}>
                      <option value="">— No Arc —</option>
                      {arcTitle && <option value={arcTitle}>{arcTitle}</option>}
                    </select>
                  </div>
                  <Field label="Chapter title" value={form.chapter_title} onChange={(v) => setForm((f) => ({ ...f, chapter_title: v }))} />
                  {structureBeats.length > 0 ? (
                    <div>
                      <label className="block text-sm font-black">Structure section</label>
                      <select className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" value={form.structure_section} onChange={(e) => setForm((f) => ({ ...f, structure_section: e.target.value }))}>
                        <option value="">Select beat...</option>
                        {structureBeats.map((beat) => <option key={beat.key} value={beat.key}>{beat.label}</option>)}
                      </select>
                    </div>
                  ) : (
                    <Field label="Structure section" value={form.structure_section} onChange={(v) => setForm((f) => ({ ...f, structure_section: v }))} />
                  )}
                  <div className="sm:col-span-2"><Field label="Chapter purpose" value={form.chapter_purpose} onChange={(v) => setForm((f) => ({ ...f, chapter_purpose: v }))} /></div>
                  <div className="sm:col-span-2"><Field label="Summary" value={form.summary} onChange={(v) => setForm((f) => ({ ...f, summary: v }))} textarea /></div>
                  <Field label="Main conflict" value={form.main_conflict} onChange={(v) => setForm((f) => ({ ...f, main_conflict: v }))} />
                  <Field label="Emotional beat" value={form.emotional_beat} onChange={(v) => setForm((f) => ({ ...f, emotional_beat: v }))} />
                  <Field label="Twist or hook" value={form.twist_or_hook} onChange={(v) => setForm((f) => ({ ...f, twist_or_hook: v }))} />
                  <Field label="Ending cliffhanger" value={form.ending_cliffhanger} onChange={(v) => setForm((f) => ({ ...f, ending_cliffhanger: v }))} />
                  {/* Cross-page reference dropdowns */}
                  <div>
                    <label className="block text-sm font-black">Characters present</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={form.characters_present.split(",").map((s: string) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setForm((f) => ({ ...f, characters_present: vals.join(", ") })); }}>
                      {(refData.characters || []).map((c: any) => <option key={c.id || c} value={c.name || c}>{c.name || c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black">Factions used</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={form.factions_used.split(",").map((s: string) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setForm((f) => ({ ...f, factions_used: vals.join(", ") })); }}>
                      {(refData.factions || []).map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black">Threats used</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={form.threats_used.split(",").map((s: string) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setForm((f) => ({ ...f, threats_used: vals.join(", ") })); }}>
                      {(refData.threats || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black">Relationships used</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={form.relationships_used.split(",").map((s: string) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setForm((f) => ({ ...f, relationships_used: vals.join(", ") })); }}>
                      {(refData.relationships || [])
                        .filter((r: any) => r.from && r.to)
                        .map((r: any) => <option key={r.id} value={r.id}>{r.from} ↔ {r.to}{r.type ? ` (${r.type})` : ""}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={onSubmit} disabled={!arcLengthSelected || !form.chapter_title || submitPending}>{form.chapter_id ? "Update Chapter" : "Create Chapter"}</button>
                  <button className="rounded-xl border-2 border-slate-400 bg-white px-5 py-3 text-sm font-black text-slate-600" onClick={() => onClose()}>Cancel</button>
                  {submitError && <ErrorBanner error={submitError} />}
                </div>
              </div>
            </div>
  );
}

export function RedoArcModal({
  structureOptions, redoStructure, setRedoStructure, redoCustomStructure, setRedoCustomStructure,
  redoConfirmation, setRedoConfirmation, onConfirm, isPending, errorMessage, onClose,
}: {
  structureOptions: string[];
  redoStructure: string;
  setRedoStructure: (v: string) => void;
  redoCustomStructure: string;
  setRedoCustomStructure: (v: string) => void;
  redoConfirmation: string;
  setRedoConfirmation: (v: string) => void;
  onConfirm: () => void;
  isPending: boolean;
  errorMessage: string;
  onClose: () => void;
}) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onClose()}>
          <div className="w-full max-w-2xl rounded-2xl border-2 border-red-600 bg-white p-6 shadow-[6px_6px_0_#991b1b]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl">!</span>
              <div>
                <h3 className="text-lg font-black text-red-700">Redo Arc Structure</h3>
                <p className="mt-1 text-sm font-semibold text-slate-700">
                  This preserves the arc overview, but clears generated chapter work so the structure can be decided again from the beginning.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <p className="font-black">This cannot be undone from this screen.</p>
              <ul className="mt-2 list-disc pl-5 text-xs font-semibold">
                <li>All plot chapters for this arc will be cleared.</li>
                <li>Scene cards tied to those chapters will be cleared.</li>
                <li>The generated Manga Script will be reset to draft.</li>
                <li>The arc title, summary, conflicts, characters, and ending target will be kept.</li>
              </ul>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-black">New narrative structure</label>
              <select
                className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm"
                value={redoStructure}
                onChange={(e) => setRedoStructure(e.target.value)}
              >
                <option value="">Select...</option>
                {structureOptions.map((option: string) => <option key={option} value={option}>{option}</option>)}
              </select>
              {redoStructure === "Custom" && (
                <CustomInput
                  label="Custom narrative structure"
                  value={redoCustomStructure}
                  onChange={setRedoCustomStructure}
                  placeholder="Describe the replacement structure..."
                />
              )}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-black">Type RESET ARC to confirm</label>
              <input
                className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm font-bold"
                value={redoConfirmation}
                onChange={(e) => setRedoConfirmation(e.target.value)}
                placeholder="RESET ARC"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                className="rounded-xl border-2 border-red-600 bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onConfirm()}
                disabled={!redoStructure || redoConfirmation !== "RESET ARC" || isPending}
              >
                {isPending ? "Resetting..." : "Reset Chapters and Script"}
              </button>
              <button
                className="rounded-xl border-2 border-slate-900 bg-white px-4 py-2.5 text-sm font-black hover:bg-slate-50"
                onClick={() => onClose()}
                disabled={isPending}
              >
                Cancel
              </button>
            </div>
            {errorMessage && <p className="mt-3 text-xs font-bold text-red-600">{errorMessage}</p>}
          </div>
        </div>
  );
}

export function DeleteChapterDialog({
  target, onConfirm, isPending, errorMessage, onClose,
}: {
  target: { id: string; title: string; number: number; isLast: boolean };
  onConfirm: () => void;
  isPending: boolean;
  errorMessage: string;
  onClose: () => void;
}) {
  return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => onClose()}>
          <div className="w-full max-w-md rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-[6px_6px_0_#111827]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl">⚠️</span>
              <div>
                <h3 className="font-black text-lg text-slate-900">Delete Chapter {target.number}?</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">&ldquo;{target.title}&rdquo;</p>
              </div>
            </div>

            {target.isLast ? (
              <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                <span className="font-black">Last chapter</span> — no chapters follow this one, so the story will stay unlocked.
                Any scenes attached to this chapter will also be removed.
              </div>
            ) : (
              <div className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-black">⚠ This will lock the story.</p>
                <p className="mt-1">Chapters that come after this one depend on it for continuity. You will need to:</p>
                <ol className="mt-2 ml-4 list-decimal space-y-0.5 text-xs font-semibold">
                  <li>Recreate Chapter {target.number}</li>
                  <li>Review and confirm each later chapter in order</li>
                  <li>All writing and scripting is disabled until the lock is cleared</li>
                </ol>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                className="flex-1 rounded-xl border-2 border-red-500 bg-red-500 px-4 py-2.5 text-sm font-black text-white hover:bg-red-600"
                onClick={() => onConfirm()}
                disabled={isPending}
              >
                {isPending ? "Deleting…" : "Yes, Delete"}
              </button>
              <button
                className="flex-1 rounded-xl border-2 border-slate-900 bg-white px-4 py-2.5 text-sm font-black hover:bg-slate-50"
                onClick={() => onClose()}
              >
                Cancel
              </button>
            </div>
            {errorMessage && <p className="mt-3 text-xs font-bold text-red-600">{errorMessage}</p>}
          </div>
        </div>
  );
}
