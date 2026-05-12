"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getUsableAiOutput } from "@/lib/aiResults";
import { useHydrateOnce } from "@/lib/hooks/useHydrate";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { AiFillPanel } from "@/components/forms/AiFillPanel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

const THREAD_TABS = [
  { key: "main", label: "Main Thread" },
  { key: "character_arcs", label: "Character Arcs" },
  { key: "relationships", label: "Relationships" },
  { key: "threats", label: "Threats" },
  { key: "powers", label: "Powers" },
];

export default function ThreadsPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const plot = useQuery({ queryKey: ["plot", storyId], queryFn: () => api.getPlotOutline(storyId) });
  const refs = useQuery({ queryKey: ["refs", storyId], queryFn: () => api.getReferences(storyId) });
  const refData = (refs.data || {}) as any;
  const refCharacters: Array<{ id: string; name: string; label?: string }> = Array.isArray(refData.characters) ? refData.characters : [];
  const refRelationships: Array<{ id: string; from: string; to: string; type?: string }> = Array.isArray(refData.relationships) ? refData.relationships : [];
  const refThreats: string[] = Array.isArray(refData.threats) ? refData.threats : [];
  const content = (plot.data?.content || plot.data || {}) as any;
  const threads = content.plot_threads || {};

  // Build a relationship_id from a "from / to" pair if a real one isn't on file.
  const fallbackRelId = (from: string, to: string) =>
    `rel_${(from || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${(to || "").toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;

  function findRelationshipIdFromText(...texts: string[]): string {
    const blob = texts.filter(Boolean).join(" ").toLowerCase();
    if (!blob) return "";
    for (const r of refRelationships) {
      const f = (r.from || "").toLowerCase();
      const t = (r.to || "").toLowerCase();
      if (f && t && blob.includes(f) && blob.includes(t)) return r.id;
    }
    return "";
  }
  function findCharacterIdFromText(...texts: string[]): string {
    const blob = texts.filter(Boolean).join(" ").toLowerCase();
    if (!blob) return "";
    for (const c of refCharacters) {
      const n = (c.name || "").toLowerCase();
      if (n && blob.includes(n)) return c.id || c.name;
    }
    return "";
  }
  function findThreatNameFromText(...texts: string[]): string {
    const blob = texts.filter(Boolean).join(" ").toLowerCase();
    if (!blob) return "";
    for (const t of refThreats) {
      if (t && blob.includes(t.toLowerCase())) return t;
    }
    return "";
  }
  const hasAnyThreads = threads.main_plot_thread?.goal || threads.main_plot_thread?.resolution || (Array.isArray(threads.character_arc_threads) && threads.character_arc_threads.length > 0) || (Array.isArray(threads.relationship_threads) && threads.relationship_threads.length > 0) || (Array.isArray(threads.threat_threads) && threads.threat_threads.length > 0) || (Array.isArray(threads.power_threads) && threads.power_threads.length > 0);

  const patch = useMutation({ mutationFn: (body: any) => api.patchArcOverview(storyId, body), onSuccess: () => plot.refetch() });
  function removeItem(branch: string, index: number) {
    if (!confirm("Remove this item?")) return;
    patch.mutate({ target_branch: branch, operation: "remove_index", value: { index } });
  }
  // Sequential patch chain — backend patches are read-modify-write, so
  // parallel `patch.mutate` calls (the prior pattern) raced and lost writes.
  const saveChain = useMutation({
    mutationFn: async (patches: Array<{ target_branch: string; operation: string; value: any }>) => {
      for (const body of patches) {
        await api.patchArcOverview(storyId, body);
      }
    },
    onSuccess: () => plot.refetch(),
  });
  const [aiThreadFields, setAiThreadFields] = useState<string[]>([]);
  const [aiThreadResults, setAiThreadResults] = useState<Record<string, any> | null>(null);
  const [aiThreadError, setAiThreadError] = useState<string | null>(null);
  const arcOverview = content.story_arc_overview || {};
  const arcReady = !!(arcOverview.arc_title || arcOverview.arc_summary);
  const chaptersExist = Array.isArray(content.chapter_or_episode_list?.chapters) && content.chapter_or_episode_list.chapters.length > 0;
  const threadsAiPrereqsMet = arcReady;
  const threadsAiPrereqsMessage = !arcReady
    ? "Fill in the arc overview on Plot Board before AI can analyze threads."
    : !chaptersExist
    ? "Tip: AI thread analysis is more accurate after at least one chapter exists."
    : "";
  const aiGen = useMutation({
    mutationFn: () => api.aiGenerate(storyId, { page: "threads", target_fields: aiThreadFields, partial_input: {}, generation_hints: {} }),
    onSuccess: (d: any) => {
      try {
        const gen = getUsableAiOutput("threads", aiThreadFields, d);
        setAiThreadError(null);
        setAiThreadResults(gen);
      } catch (err: any) {
        setAiThreadResults(null);
        setAiThreadError(err?.message || AI_EMPTY_MESSAGE);
      }
    },
    onError: (err: any) => {
      setAiThreadResults(null);
      setAiThreadError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });

  function enrichMain(m: any): any {
    const defaults = { goal: "", obstacles: [], turning_points: [], resolution: "" };
    return { ...defaults, ...m };
  }

  function enrichArrs(arr: any[], defaults: any): any[] {
    if (!Array.isArray(arr) || arr.length === 0) return [defaults];
    return arr.map(item => ({ ...defaults, ...item }));
  }

  function handleApplyAi(results: any) {
    const gen = results?.generated_fields || results || {};
    if (gen.main) {
      const m = enrichMain(gen.main);
      if (m.goal) setMainGoal(m.goal);
      if (m.obstacles) setMainObstacles(Array.isArray(m.obstacles) ? m.obstacles.join("\n") : String(m.obstacles));
      if (m.turning_points) setMainTurning(Array.isArray(m.turning_points) ? m.turning_points.join("\n") : String(m.turning_points));
      if (m.resolution) setMainResolution(m.resolution);
    }
    if (gen.character_arcs) {
      // If AI omits character_id, infer from any text field that mentions a known character.
      const arr = enrichArrs(gen.character_arcs, { character_id: "", starting_state: "", growth_beats: "", lowest_point: "", final_state: "" })
        .map((c: any) => ({
          ...c,
          character_id: c.character_id || findCharacterIdFromText(c.starting_state, c.lowest_point, c.final_state, Array.isArray(c.growth_beats) ? c.growth_beats.join(" ") : c.growth_beats),
        }));
      setCharThreads(arr);
    }
    if (gen.relationships) {
      const arr = enrichArrs(gen.relationships, { relationship_id: "", start_dynamic: "", change_beats: "", breaking_point: "", final_dynamic: "" })
        .map((r: any) => {
          let rid = r.relationship_id || "";
          if (!rid) {
            // Try the dynamic / beats text first — it usually mentions both names.
            rid = findRelationshipIdFromText(r.start_dynamic, r.breaking_point, r.final_dynamic, Array.isArray(r.change_beats) ? r.change_beats.join(" ") : r.change_beats);
          }
          if (!rid && (r.from || r.to || r.character_a || r.character_b)) {
            rid = fallbackRelId(r.from || r.character_a || "", r.to || r.character_b || "");
          }
          return { ...r, relationship_id: rid };
        });
      setRelThreads(arr);
    }
    if (gen.threats) {
      const arr = enrichArrs(gen.threats, { threat_id_or_name: "", first_hint: "", escalation_beats: "", reveal: "", final_outcome: "" })
        .map((t: any) => ({
          ...t,
          threat_id_or_name: t.threat_id_or_name || findThreatNameFromText(t.first_hint, t.reveal, t.final_outcome, Array.isArray(t.escalation_beats) ? t.escalation_beats.join(" ") : t.escalation_beats),
        }));
      setThreatThreads(arr);
    }
    if (gen.powers) {
      const arr = enrichArrs(gen.powers, { character_id: "", power_name: "", first_use: "", training_or_failure_beats: "", breakthrough: "", cost_or_consequence: "" })
        .map((p: any) => ({
          ...p,
          character_id: p.character_id || findCharacterIdFromText(p.power_name, p.first_use, p.breakthrough, p.cost_or_consequence, Array.isArray(p.training_or_failure_beats) ? p.training_or_failure_beats.join(" ") : p.training_or_failure_beats),
        }));
      setPowerThreads(arr);
    }
    setAiThreadResults(null);
  }

  const [activeTab, setActiveTab] = useState("main");

  const [mainGoal, setMainGoal] = useState("");
  const [mainObstacles, setMainObstacles] = useState("");
  const [mainTurning, setMainTurning] = useState("");
  const [mainResolution, setMainResolution] = useState("");

  const emptyChar = { character_id: "", starting_state: "", growth_beats: "", lowest_point: "", final_state: "" };
  const emptyRel = { relationship_id: "", start_dynamic: "", change_beats: "", breaking_point: "", final_dynamic: "" };
  const emptyThreat = { threat_id_or_name: "", first_hint: "", escalation_beats: "", reveal: "", final_outcome: "" };
  const emptyPower = { character_id: "", power_name: "", first_use: "", training_or_failure_beats: "", breakthrough: "", cost_or_consequence: "" };
  const [charThreads, setCharThreads] = useState<any[]>([{ ...emptyChar }]);
  const [relThreads, setRelThreads] = useState<any[]>([{ ...emptyRel }]);
  const [threatThreads, setThreatThreads] = useState<any[]>([{ ...emptyThreat }]);
  const [powerThreads, setPowerThreads] = useState<any[]>([{ ...emptyPower }]);

  // Hydrate from saved JSON exactly once per story so existing threads aren't
  // erased the moment the user reopens the page.
  useHydrateOnce(!!plot.data, storyId, () => {
    const t = ((plot.data?.content || plot.data || {}) as any).plot_threads || {};
    const m = t.main_plot_thread || {};
    setMainGoal(m.goal || "");
    setMainResolution(m.resolution || "");
    setMainObstacles(Array.isArray(m.obstacles) ? m.obstacles.join("\n") : (m.obstacles || ""));
    setMainTurning(Array.isArray(m.turning_points) ? m.turning_points.join("\n") : (m.turning_points || ""));
    const toLines = (v: any) => Array.isArray(v) ? v.join("\n") : (v || "");
    if (Array.isArray(t.character_arc_threads) && t.character_arc_threads.length > 0) {
      setCharThreads(t.character_arc_threads.map((c: any) => ({ ...emptyChar, ...c, growth_beats: toLines(c.growth_beats) })));
    }
    if (Array.isArray(t.relationship_threads) && t.relationship_threads.length > 0) {
      setRelThreads(t.relationship_threads.map((r: any) => ({ ...emptyRel, ...r, change_beats: toLines(r.change_beats) })));
    }
    if (Array.isArray(t.threat_threads) && t.threat_threads.length > 0) {
      setThreatThreads(t.threat_threads.map((x: any) => ({ ...emptyThreat, ...x, escalation_beats: toLines(x.escalation_beats) })));
    }
    if (Array.isArray(t.power_threads) && t.power_threads.length > 0) {
      setPowerThreads(t.power_threads.map((p: any) => ({ ...emptyPower, ...p, training_or_failure_beats: toLines(p.training_or_failure_beats) })));
    }
  });

  type Patch = { target_branch: string; operation: string; value: any };
  const branch = (suffix: string): string => `plot_threads.${suffix}`;
  const toLines = (value: any): string[] => Array.isArray(value) ? value.filter(Boolean) : String(value || "").split("\n").map((s) => s.trim()).filter(Boolean);

  function buildThreadsPayload() {
    return {
      main_plot_thread: {
        goal: mainGoal,
        obstacles: toLines(mainObstacles),
        turning_points: toLines(mainTurning),
        resolution: mainResolution,
      },
      character_arc_threads: charThreads
        .filter((c) => c.character_id || c.starting_state || c.growth_beats || c.lowest_point || c.final_state)
        .map((c) => ({
          character_id: c.character_id || "",
          starting_state: c.starting_state || "",
          growth_beats: toLines(c.growth_beats),
          lowest_point: c.lowest_point || "",
          final_state: c.final_state || "",
        })),
      relationship_threads: relThreads
        .filter((r) => r.relationship_id || r.start_dynamic || r.change_beats || r.breaking_point || r.final_dynamic)
        .map((r) => ({
          relationship_id: r.relationship_id || "",
          start_dynamic: r.start_dynamic || "",
          change_beats: toLines(r.change_beats),
          breaking_point: r.breaking_point || "",
          final_dynamic: r.final_dynamic || "",
        })),
      threat_threads: threatThreads
        .filter((t) => t.threat_id_or_name || t.first_hint || t.escalation_beats || t.reveal || t.final_outcome)
        .map((t) => ({
          threat_id_or_name: t.threat_id_or_name || "",
          first_hint: t.first_hint || "",
          escalation_beats: toLines(t.escalation_beats),
          reveal: t.reveal || "",
          final_outcome: t.final_outcome || "",
        })),
      power_threads: powerThreads
        .filter((p) => p.character_id || p.power_name || p.first_use || p.training_or_failure_beats || p.breakthrough || p.cost_or_consequence)
        .map((p) => ({
          character_id: p.character_id || "",
          power_name: p.power_name || "",
          first_use: p.first_use || "",
          training_or_failure_beats: toLines(p.training_or_failure_beats),
          breakthrough: p.breakthrough || "",
          cost_or_consequence: p.cost_or_consequence || "",
        })),
    };
  }

  function saveAllThreads() {
    saveChain.mutate([{ target_branch: "plot_threads", operation: "replace", value: buildThreadsPayload() }]);
  }

  function saveMainThread() {
    const ops: Patch[] = [];
    if (mainGoal) ops.push({ target_branch: branch("main_plot_thread.goal"), operation: "replace", value: mainGoal });
    if (mainResolution) ops.push({ target_branch: branch("main_plot_thread.resolution"), operation: "replace", value: mainResolution });
    if (mainObstacles) ops.push({ target_branch: branch("main_plot_thread.obstacles"), operation: "replace", value: toLines(mainObstacles) });
    if (mainTurning) ops.push({ target_branch: branch("main_plot_thread.turning_points"), operation: "replace", value: toLines(mainTurning) });
    if (ops.length) saveChain.mutate(ops);
  }

  function saveItemListThreads(items: any[], suffix: string, idField: string, lineFields: string[]) {
    const ops: Patch[] = [];
    const clean = items.filter((c) => c[idField]);
    clean.forEach((c, i) => {
      for (const [k, v] of Object.entries(c)) {
        if (v === "" || v === null || v === undefined) continue;
        const val = lineFields.includes(k) ? toLines(v) : v;
        ops.push({ target_branch: branch(`${suffix}[${i}].${k}`), operation: "replace", value: val });
      }
    });
    if (ops.length) saveChain.mutate(ops);
  }
  function saveCharThreads() { saveItemListThreads(charThreads, "character_arc_threads", "character_id", ["growth_beats"]); }
  function saveRelThreads() { saveItemListThreads(relThreads, "relationship_threads", "relationship_id", ["change_beats"]); }
  function saveThreatThreads() { saveItemListThreads(threatThreads, "threat_threads", "threat_id_or_name", ["escalation_beats"]); }
  function savePowerThreads() { saveItemListThreads(powerThreads, "power_threads", "character_id", ["training_or_failure_beats"]); }

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Plot Threads" subtitle="Track main plot, character arcs, relationships, threats, and power threads.">
        {!hasAnyThreads && !plot.isLoading && (
          <div className="mb-4 rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">No plot threads defined yet. Switch between the tabs below to define your main thread goal, character arcs, relationship dynamics, threat escalation, and power progression.</div>
        )}
        <AiFillPanel page="threads" fields={[{ key: "main", label: "Main Thread", description: "Goal, obstacles, resolution" }, { key: "character_arcs", label: "Character Arcs", description: "Analysis per character" }, { key: "relationships", label: "Relationships", description: "Relationship dynamics" }, { key: "threats", label: "Threats", description: "Threat escalation analysis" }, { key: "powers", label: "Powers", description: "Power progression analysis" }]} note="Required: arc overview filled (Plot Board → Arc overview). AI analyzes saved story context to identify plot threads, arcs, relationships, threats, and powers." onFieldSelect={setAiThreadFields} onGenerate={() => { if (!threadsAiPrereqsMet) { alert(threadsAiPrereqsMessage); return; } aiGen.mutate(); }} loading={aiGen.isPending} results={aiThreadResults} onClear={() => setAiThreadResults(null)} onApply={handleApplyAi} disabled={!threadsAiPrereqsMet} disabledReason={threadsAiPrereqsMessage} error={aiThreadError} onDismissError={() => setAiThreadError(null)} />
        {saveChain.isError && <div className="mb-3"><ErrorBanner error={saveChain.error as Error} /></div>}
        {patch.isError && <div className="mb-3"><ErrorBanner error={patch.error as Error} /></div>}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-slate-200 bg-white p-3">
          <p className="text-xs font-bold text-slate-600">Save every tab on this page into plot_threads.json in one write.</p>
          <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={saveAllThreads} disabled={saveChain.isPending}>
            {saveChain.isPending ? "Saving..." : "Save All Threads"}
          </button>
        </div>
        <div className="space-y-4">
          {/* Tab bar */}
          <div className="flex flex-wrap border-b-2 border-slate-200">
            {THREAD_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 py-2.5 text-xs font-bold transition sm:px-4 sm:py-3 sm:text-sm ${activeTab === tab.key ? "border-b-2 border-slate-900 bg-slate-100 text-slate-900 -mb-0.5" : "text-slate-500 hover:text-slate-700"}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Main Thread */}
          {activeTab === "main" && (
            <div className="space-y-3">
              <Field label="Main goal" value={mainGoal} onChange={setMainGoal} textarea placeholder="The central goal of the entire story..." />
              <Field label="Obstacles (one per line)" value={mainObstacles} onChange={setMainObstacles} textarea placeholder="List each obstacle..." />
              <Field label="Turning points (one per line)" value={mainTurning} onChange={setMainTurning} textarea placeholder="Key turning points in the plot..." />
              <Field label="Resolution" value={mainResolution} onChange={setMainResolution} textarea placeholder="How the main plot resolves..." />
              <div className="flex flex-wrap gap-2">
                <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-black text-white" onClick={saveMainThread} disabled={saveChain.isPending}>{saveChain.isPending ? "Saving..." : "Save Main Thread"}</button>
                <button className="rounded-xl border-2 border-red-400 bg-white px-4 py-2.5 text-sm font-black text-red-500" onClick={() => { if (confirm("Clear all main thread fields?")) { setMainGoal(""); setMainObstacles(""); setMainTurning(""); setMainResolution(""); } }}>Clear</button>
              </div>
            </div>
          )}

          {/* Character Arc Threads */}
          {activeTab === "character_arcs" && (
            <div className="space-y-4">
              {charThreads.map((c, i) => (
                <details key={i} className="rounded-xl border-2 border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4" open>
                  <summary className="cursor-pointer font-bold text-sm">Character Arc {i + 1}{!c.character_id && <span className="ml-2 text-[10px] font-bold text-red-600">(pick a character to save)</span>}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-black">Character</span>
                      <select className={`mt-1.5 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base ${c.character_id ? "border-slate-900" : "border-red-500 bg-red-50"}`} value={c.character_id || ""} onChange={(e) => { const v = e.target.value; setCharThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], character_id: v }; return n; }); }}>
                        <option value="">Select character...</option>
                        {refCharacters.map((ch) => <option key={ch.id || ch.name} value={ch.id || ch.name}>{ch.name || ch.id}</option>)}
                        {c.character_id && !refCharacters.some((ch) => (ch.id || ch.name) === c.character_id) && <option value={c.character_id}>{c.character_id} (not in cast)</option>}
                      </select>
                    </label>
                    <Field label="Starting state" value={c.starting_state} onChange={(v) => { setCharThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], starting_state: v }; return n; }); }} />
                    <div className="sm:col-span-2"><Field label="Growth beats (one per line)" value={c.growth_beats} onChange={(v) => { setCharThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], growth_beats: v }; return n; }); }} textarea /></div>
                    <Field label="Lowest point" value={c.lowest_point} onChange={(v) => { setCharThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], lowest_point: v }; return n; }); }} />
                    <Field label="Final state" value={c.final_state} onChange={(v) => { setCharThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], final_state: v }; return n; }); }} />
                  </div>
                  {i > 0 && <button className="mt-2 text-xs font-bold text-red-500" onClick={() => removeItem("plot_threads.character_arc_threads", i)} disabled={patch.isPending}>Remove</button>}
                </details>
              ))}
              <button className="rounded-xl border-2 border-slate-400 bg-white px-4 py-2 text-sm font-black" onClick={() => setCharThreads((prev) => [...prev, { character_id: "", starting_state: "", growth_beats: "", lowest_point: "", final_state: "" }])}>+ Add Character Arc</button>
              <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-black text-white ml-2" onClick={saveCharThreads} disabled={saveChain.isPending}>{saveChain.isPending ? "Saving..." : "Save Character Arcs"}</button>
            </div>
          )}

          {/* Relationship Threads */}
          {activeTab === "relationships" && (
            <div className="space-y-4">
              {refRelationships.length === 0 && (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  No relationships exist yet — open Relationship Web (Cast section) and define some, then come back. Without a relationship_id this thread won&apos;t save.
                </div>
              )}
              {relThreads.map((r, i) => (
                <details key={i} className="rounded-xl border-2 border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4" open>
                  <summary className="cursor-pointer font-bold text-sm">Relationship {i + 1}{!r.relationship_id && <span className="ml-2 text-[10px] font-bold text-red-600">(pick a relationship to save)</span>}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-black">Relationship</span>
                      <select className={`mt-1.5 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base ${r.relationship_id ? "border-slate-900" : "border-red-500 bg-red-50"}`} value={r.relationship_id || ""} onChange={(e) => { const v = e.target.value; setRelThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], relationship_id: v }; return n; }); }}>
                        <option value="">Select relationship...</option>
                        {refRelationships.map((rel) => <option key={rel.id} value={rel.id}>{rel.from} ↔ {rel.to}{rel.type ? ` (${rel.type})` : ""}</option>)}
                        {r.relationship_id && !refRelationships.some((rel) => rel.id === r.relationship_id) && <option value={r.relationship_id}>{r.relationship_id} (not in cast)</option>}
                      </select>
                    </label>
                    <Field label="Start dynamic" value={r.start_dynamic} onChange={(v) => { setRelThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], start_dynamic: v }; return n; }); }} />
                    <div className="sm:col-span-2"><Field label="Change beats (one per line)" value={r.change_beats} onChange={(v) => { setRelThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], change_beats: v }; return n; }); }} textarea /></div>
                    <Field label="Breaking point" value={r.breaking_point} onChange={(v) => { setRelThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], breaking_point: v }; return n; }); }} />
                    <Field label="Final dynamic" value={r.final_dynamic} onChange={(v) => { setRelThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], final_dynamic: v }; return n; }); }} />
                  </div>
                  {i > 0 && <button className="mt-2 text-xs font-bold text-red-500" onClick={() => removeItem("plot_threads.relationship_threads", i)} disabled={patch.isPending}>Remove</button>}
                </details>
              ))}
              <button className="rounded-xl border-2 border-slate-400 bg-white px-4 py-2 text-sm font-black" onClick={() => setRelThreads((prev) => [...prev, { relationship_id: "", start_dynamic: "", change_beats: "", breaking_point: "", final_dynamic: "" }])}>+ Add Relationship Thread</button>
              <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-black text-white ml-2" onClick={saveRelThreads} disabled={saveChain.isPending}>{saveChain.isPending ? "Saving..." : "Save Relationships"}</button>
            </div>
          )}

          {/* Threat Threads */}
          {activeTab === "threats" && (
            <div className="space-y-4">
              {threatThreads.map((t, i) => (
                <details key={i} className="rounded-xl border-2 border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4" open>
                  <summary className="cursor-pointer font-bold text-sm">Threat Thread {i + 1}{!t.threat_id_or_name && <span className="ml-2 text-[10px] font-bold text-red-600">(pick a threat to save)</span>}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-black">Threat</span>
                      <select className={`mt-1.5 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base ${t.threat_id_or_name ? "border-slate-900" : "border-red-500 bg-red-50"}`} value={t.threat_id_or_name || ""} onChange={(e) => { const v = e.target.value; setThreatThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], threat_id_or_name: v }; return n; }); }}>
                        <option value="">Select threat...</option>
                        {refThreats.map((thr) => <option key={thr} value={thr}>{thr}</option>)}
                        {t.threat_id_or_name && !refThreats.includes(t.threat_id_or_name) && <option value={t.threat_id_or_name}>{t.threat_id_or_name} (custom)</option>}
                      </select>
                    </label>
                    <Field label="First hint" value={t.first_hint} onChange={(v) => { setThreatThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], first_hint: v }; return n; }); }} />
                    <div className="sm:col-span-2"><Field label="Escalation beats (one per line)" value={t.escalation_beats} onChange={(v) => { setThreatThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], escalation_beats: v }; return n; }); }} textarea /></div>
                    <Field label="Reveal" value={t.reveal} onChange={(v) => { setThreatThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], reveal: v }; return n; }); }} />
                    <Field label="Final outcome" value={t.final_outcome} onChange={(v) => { setThreatThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], final_outcome: v }; return n; }); }} />
                  </div>
                  {i > 0 && <button className="mt-2 text-xs font-bold text-red-500" onClick={() => removeItem("plot_threads.threat_threads", i)} disabled={patch.isPending}>Remove</button>}
                </details>
              ))}
              <button className="rounded-xl border-2 border-slate-400 bg-white px-4 py-2 text-sm font-black" onClick={() => setThreatThreads((prev) => [...prev, { threat_id_or_name: "", first_hint: "", escalation_beats: "", reveal: "", final_outcome: "" }])}>+ Add Threat Thread</button>
              <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-black text-white ml-2" onClick={saveThreatThreads} disabled={saveChain.isPending}>{saveChain.isPending ? "Saving..." : "Save Threats"}</button>
            </div>
          )}

          {/* Power Threads */}
          {activeTab === "powers" && (
            <div className="space-y-4">
              {powerThreads.map((p, i) => (
                <details key={i} className="rounded-xl border-2 border-slate-200 bg-white p-3 sm:rounded-2xl sm:p-4" open>
                  <summary className="cursor-pointer font-bold text-sm">Power Thread {i + 1}{!p.character_id && <span className="ml-2 text-[10px] font-bold text-red-600">(pick a character to save)</span>}</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-sm font-black">Character</span>
                      <select className={`mt-1.5 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base ${p.character_id ? "border-slate-900" : "border-red-500 bg-red-50"}`} value={p.character_id || ""} onChange={(e) => { const v = e.target.value; setPowerThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], character_id: v }; return n; }); }}>
                        <option value="">Select character...</option>
                        {refCharacters.map((ch) => <option key={ch.id || ch.name} value={ch.id || ch.name}>{ch.name || ch.id}</option>)}
                        {p.character_id && !refCharacters.some((ch) => (ch.id || ch.name) === p.character_id) && <option value={p.character_id}>{p.character_id} (not in cast)</option>}
                      </select>
                    </label>
                    <Field label="Power name" value={p.power_name} onChange={(v) => { setPowerThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], power_name: v }; return n; }); }} />
                    <Field label="First use" value={p.first_use} onChange={(v) => { setPowerThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], first_use: v }; return n; }); }} />
                    <Field label="Breakthrough" value={p.breakthrough} onChange={(v) => { setPowerThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], breakthrough: v }; return n; }); }} />
                    <div className="sm:col-span-2"><Field label="Training or failure beats (one per line)" value={p.training_or_failure_beats} onChange={(v) => { setPowerThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], training_or_failure_beats: v }; return n; }); }} textarea /></div>
                    <Field label="Cost or consequence" value={p.cost_or_consequence} onChange={(v) => { setPowerThreads((prev) => { const n = [...prev]; n[i] = { ...n[i], cost_or_consequence: v }; return n; }); }} />
                  </div>
                  {i > 0 && <button className="mt-2 text-xs font-bold text-red-500" onClick={() => removeItem("plot_threads.power_threads", i)} disabled={patch.isPending}>Remove</button>}
                </details>
              ))}
              <button className="rounded-xl border-2 border-slate-400 bg-white px-4 py-2 text-sm font-black" onClick={() => setPowerThreads((prev) => [...prev, { character_id: "", power_name: "", first_use: "", training_or_failure_beats: "", breakthrough: "", cost_or_consequence: "" }])}>+ Add Power Thread</button>
              <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-2.5 text-sm font-black text-white ml-2" onClick={savePowerThreads} disabled={saveChain.isPending}>{saveChain.isPending ? "Saving..." : "Save Powers"}</button>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="plot_threads.json"><StructuredJsonView data={threads} /></Panel>
    </div>
  );
}
