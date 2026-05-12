"use client";

// The narrative-structure beat editors (Kishotenketsu / Three-Act / Hero's
// Journey) lifted out of board/page.tsx. Presentational — the parent owns the
// per-section form state and the save action.

import type { Dispatch, SetStateAction } from "react";
import { Field } from "@/components/forms/Field";

type S = Record<string, string>;
type Setter = Dispatch<SetStateAction<S>>;

export interface StructureEditorsState {
  ki: S; setKi: Setter;
  sho: S; setSho: Setter;
  ten: S; setTen: Setter;
  ketsu: S; setKetsu: Setter;
  act1: S; setAct1: Setter;
  act2: S; setAct2: Setter;
  act3: S; setAct3: Setter;
}

export function StructureEditors({
  structure, editors, onSave, saving, disabled,
}: {
  structure: string;
  editors: StructureEditorsState;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}) {
  const { ki, setKi, sho, setSho, ten, setTen, ketsu, setKetsu, act1, setAct1, act2, setAct2, act3, setAct3 } = editors;
  return (
    <>
          {/* ---- STRUCTURE EDITORS ---- */}
          {structure === "Kishotenketsu" && (
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4 space-y-4 sm:rounded-2xl">
              <h3 className="font-black text-violet-800">Kishotenketsu Outline</h3>
              <details className="rounded-lg border border-violet-200 bg-white p-3" open><summary className="font-bold text-sm">Ki — Introduction</summary>
                <div className="mt-2 space-y-2"><Field label="Initial mystery or question" value={ki.initial_mystery_or_question} onChange={(v) => setKi((f) => ({ ...f, initial_mystery_or_question: v }))} /><Field label="Opening image" value={ki.opening_image} onChange={(v) => setKi((f) => ({ ...f, opening_image: v }))} /><Field label="Chapter range" value={ki.chapter_range} onChange={(v) => setKi((f) => ({ ...f, chapter_range: v }))} /></div>
              </details>
              <details className="rounded-lg border border-violet-200 bg-white p-3" open><summary className="font-bold text-sm">Sho — Development</summary>
                <div className="mt-2 space-y-2"><Field label="Tension growth" value={sho.tension_growth} onChange={(v) => setSho((f) => ({ ...f, tension_growth: v }))} /><Field label="Chapter range" value={sho.chapter_range} onChange={(v) => setSho((f) => ({ ...f, chapter_range: v }))} /></div>
              </details>
              <details className="rounded-lg border border-violet-200 bg-white p-3" open><summary className="font-bold text-sm">Ten — Twist / Turn</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label="Main twist" value={ten.main_twist} onChange={(v) => setTen((f) => ({ ...f, main_twist: v }))} /><Field label="Hidden truth revealed" value={ten.hidden_truth_revealed} onChange={(v) => setTen((f) => ({ ...f, hidden_truth_revealed: v }))} /><Field label="Major threat recontextualized" value={ten.major_threat_recontextualized} onChange={(v) => setTen((f) => ({ ...f, major_threat_recontextualized: v }))} /><Field label="Relationship reversal" value={ten.relationship_reversal} onChange={(v) => setTen((f) => ({ ...f, relationship_reversal: v }))} /><div className="sm:col-span-2"><Field label="Character arc turning point" value={ten.character_arc_turning_point} onChange={(v) => setTen((f) => ({ ...f, character_arc_turning_point: v }))} /></div><Field label="Chapter range" value={ten.chapter_range} onChange={(v) => setTen((f) => ({ ...f, chapter_range: v }))} /></div>
              </details>
              <details className="rounded-lg border border-violet-200 bg-white p-3" open><summary className="font-bold text-sm">Ketsu — Conclusion</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label="Conflict resolution" value={ketsu.conflict_resolution} onChange={(v) => setKetsu((f) => ({ ...f, conflict_resolution: v }))} /><Field label="Emotional resolution" value={ketsu.emotional_resolution} onChange={(v) => setKetsu((f) => ({ ...f, emotional_resolution: v }))} /><Field label="Relationship resolution" value={ketsu.relationship_resolution} onChange={(v) => setKetsu((f) => ({ ...f, relationship_resolution: v }))} /><Field label="World state after arc" value={ketsu.world_state_after_arc} onChange={(v) => setKetsu((f) => ({ ...f, world_state_after_arc: v }))} /><Field label="Character final state" value={ketsu.character_final_state} onChange={(v) => setKetsu((f) => ({ ...f, character_final_state: v }))} /><Field label="Chapter range" value={ketsu.chapter_range} onChange={(v) => setKetsu((f) => ({ ...f, chapter_range: v }))} /></div>
              </details>
            </div>
          )}

          {(structure === "Three-Act Structure" || structure === "Hero's Journey") && (
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4 space-y-4 sm:rounded-2xl">
              <h3 className="font-black text-violet-800">{structure === "Three-Act Structure" ? "Three-Act Structure" : "Hero's Journey"}</h3>
              <details className="rounded-lg border border-violet-200 bg-white p-3" open><summary className="font-bold text-sm">Act 1 — Setup</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label="Opening hook" value={act1.opening_hook} onChange={(v) => setAct1((f) => ({ ...f, opening_hook: v }))} /><Field label="Normal world" value={act1.normal_world} onChange={(v) => setAct1((f) => ({ ...f, normal_world: v }))} /><Field label="Inciting incident" value={act1.inciting_incident} onChange={(v) => setAct1((f) => ({ ...f, inciting_incident: v }))} /><Field label="First major choice" value={act1.first_major_choice} onChange={(v) => setAct1((f) => ({ ...f, first_major_choice: v }))} /><Field label="Main goal locked" value={act1.main_goal_locked} onChange={(v) => setAct1((f) => ({ ...f, main_goal_locked: v }))} /><Field label="Chapter range" value={act1.chapter_range} onChange={(v) => setAct1((f) => ({ ...f, chapter_range: v }))} /></div>
              </details>
              {structure === "Three-Act Structure" && (
                <details className="rounded-lg border border-violet-200 bg-white p-3" open><summary className="font-bold text-sm">Act 2 — Escalation</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label="Midpoint reveal or defeat" value={act2.midpoint_reveal_or_defeat} onChange={(v) => setAct2((f) => ({ ...f, midpoint_reveal_or_defeat: v }))} /><Field label="Stakes increase" value={act2.stakes_increase} onChange={(v) => setAct2((f) => ({ ...f, stakes_increase: v }))} /><Field label="Chapter range" value={act2.chapter_range} onChange={(v) => setAct2((f) => ({ ...f, chapter_range: v }))} /></div>
                </details>
              )}
              <details className="rounded-lg border border-violet-200 bg-white p-3" open><summary className="font-bold text-sm">Act {structure === "Three-Act Structure" ? "3" : "2-3"} — Climax & Resolution</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2"><Field label="Darkest moment" value={act3.darkest_moment} onChange={(v) => setAct3((f) => ({ ...f, darkest_moment: v }))} /><Field label="Final plan or breakthrough" value={act3.final_plan_or_breakthrough} onChange={(v) => setAct3((f) => ({ ...f, final_plan_or_breakthrough: v }))} /><Field label="Climax battle/confrontation" value={act3.climax_battle_or_confrontation} onChange={(v) => setAct3((f) => ({ ...f, climax_battle_or_confrontation: v }))} /><Field label="Major threat outcome" value={act3.major_threat_outcome} onChange={(v) => setAct3((f) => ({ ...f, major_threat_outcome: v }))} /><Field label="Character arc payoff" value={act3.character_arc_payoff} onChange={(v) => setAct3((f) => ({ ...f, character_arc_payoff: v }))} /><Field label="Relationship payoff" value={act3.relationship_payoff} onChange={(v) => setAct3((f) => ({ ...f, relationship_payoff: v }))} /><Field label="Ending image" value={act3.ending_image} onChange={(v) => setAct3((f) => ({ ...f, ending_image: v }))} /><Field label="Chapter range" value={act3.chapter_range} onChange={(v) => setAct3((f) => ({ ...f, chapter_range: v }))} /></div>
              </details>
            </div>
          )}

          {(structure === "Kishotenketsu" || structure === "Three-Act Structure" || structure === "Hero's Journey") && (
            <button className="mt-1 rounded-xl border-2 border-violet-600 bg-violet-600 px-3 py-1.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm" onClick={onSave} disabled={disabled}>{saving ? "Saving..." : "Save Structure Editor"}</button>
          )}
    </>
  );
}
