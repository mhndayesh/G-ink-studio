"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getUsableAiOutput, hasUsableAiOutput } from "@/lib/aiResults";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { AiFillPanel } from "@/components/forms/AiFillPanel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

type SceneForm = {
  scene_id?: string;
  chapter_id: string;
  scene_order: number;
  location: string;
  time: string;
  characters_present: string;
  scene_goal: string;
  scene_conflict: string;
  relationship_dynamic_used: string;
  new_information_revealed: string;
  action_or_dialogue_focus: string;
  visual_manga_moment: string;
  panel_mood: string;
  ending_beat: string;
  custom_scene_details: string;
};

type SceneRecommendation = {
  chapter_id: string;
  chapter_number?: number;
  chapter_title?: string;
  current_scene_count?: number;
  recommended_scene_count?: number;
  reason?: string;
  must_cover_beats?: string[];
};

function emptyForm(chapterId: string, order: number): SceneForm {
  return { chapter_id: chapterId, scene_order: order, location: "", time: "", characters_present: "", scene_goal: "", scene_conflict: "", relationship_dynamic_used: "", new_information_revealed: "", action_or_dialogue_focus: "", visual_manga_moment: "", panel_mood: "", ending_beat: "", custom_scene_details: "" };
}

export default function ScenesPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const plot = useQuery({ queryKey: ["plot", storyId], queryFn: () => api.getPlotOutline(storyId) });
  const refs = useQuery({ queryKey: ["refs", storyId], queryFn: () => api.getReferences(storyId) });
  const refData = (refs.data || {}) as any;
  const content = (plot.data?.content || plot.data || {}) as any;
  const chapters = content.chapter_or_episode_list?.chapters || [];
  const scenes = content.scene_cards?.scenes || [];

  const createScene = useMutation({ mutationFn: (body: any) => api.createScene(storyId, body), onSuccess: () => plot.refetch() });
  const deleteSceneMut = useMutation({ mutationFn: (sceneId: string) => api.deleteScene(storyId, sceneId), onSuccess: () => plot.refetch() });
  const [aiSceneFields, setAiSceneFields] = useState<string[]>([]);
  const [aiSceneResults, setAiSceneResults] = useState<Record<string, any> | null>(null);
  const [aiSceneError, setAiSceneError] = useState<string | null>(null);
  const [sceneRecommendations, setSceneRecommendations] = useState<SceneRecommendation[]>([]);
  const [sceneRecommendationError, setSceneRecommendationError] = useState<string | null>(null);
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [scenesPerChapter, setScenesPerChapter] = useState(3);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [applyingRecChapterId, setApplyingRecChapterId] = useState<string | null>(null);
  const [appliedRecChapterIds, setAppliedRecChapterIds] = useState<string[]>([]);
  const [applyAllRecsRunning, setApplyAllRecsRunning] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [editingScene, setEditingScene] = useState<any>(null);
  const [form, setForm] = useState<SceneForm>(emptyForm("", 1));

  function buildSceneGenHints(): any {
    const targetChapters = chapters
      .filter((ch: any) => selectedChapters.includes(ch.chapter_id))
      .map((ch: any) => ({
        chapter_id: ch.chapter_id,
        chapter_number: ch.chapter_number,
        chapter_title: ch.chapter_title,
        chapter_purpose: ch.chapter_purpose,
        summary: ch.summary,
        structure_section: ch.structure_section,
        characters_present: ch.characters_present || [],
        ending_cliffhanger: ch.ending_cliffhanger,
        existing_scene_count: scenes.filter((s: any) => s.chapter_id === ch.chapter_id).length,
      }));
    return { chapter_ids: selectedChapters, target_chapters: targetChapters, scenes_per_chapter: scenesPerChapter };
  }

  const aiGen = useMutation({
    mutationFn: () => {
      const partial: any = {};
      if (selectedChapters.length > 0) partial.selected_chapter_ids = selectedChapters;
      return api.aiGenerate(storyId, { page: "scenes", target_fields: aiSceneFields, partial_input: partial, generation_hints: buildSceneGenHints() });
    },
    onSuccess: (d: any) => {
      try {
        const gen = getUsableAiOutput("scenes", aiSceneFields, d);
        setAiSceneError(null);
        setAiSceneResults(gen);
      } catch (err: any) {
        setAiSceneResults(null);
        setAiSceneError(err?.message || AI_EMPTY_MESSAGE);
      }
    },
    onError: (err: any) => {
      setAiSceneResults(null);
      setAiSceneError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });

  const recommendScenes = useMutation({
    mutationFn: () => {
      const partial: any = {};
      if (selectedChapters.length > 0) partial.selected_chapter_ids = selectedChapters;
      return api.aiGenerate(storyId, {
        page: "scenes",
        target_fields: ["scene_count_recommendations"],
        partial_input: partial,
        generation_hints: buildSceneGenHints(),
      });
    },
    onSuccess: (d: any) => {
      if (!hasUsableAiOutput("scenes", ["scene_count_recommendations"], d)) {
        setSceneRecommendations([]);
        setSceneRecommendationError(AI_EMPTY_MESSAGE);
        return;
      }
      setSceneRecommendationError(null);
      setSceneRecommendations(normalizeRecommendations(d?.generated_fields || d || {}));
    },
    onError: (err: any) => {
      setSceneRecommendations([]);
      setSceneRecommendationError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });

  function openNew(chapterId: string) {
    const nextOrder = scenes.filter((s: any) => s.chapter_id === chapterId).length + 1;
    setForm(emptyForm(chapterId, nextOrder));
    setEditingScene(null);
    setShowModal(true);
  }

  function openEdit(scene: any) {
    setForm({
      scene_id: scene.scene_id,
      chapter_id: scene.chapter_id || "",
      scene_order: scene.scene_order || 1,
      location: scene.location || "",
      time: scene.time || "",
      characters_present: (scene.characters_present || []).join(", "),
      scene_goal: scene.scene_goal || "",
      scene_conflict: scene.scene_conflict || "",
      relationship_dynamic_used: scene.relationship_dynamic_used || "",
      new_information_revealed: scene.new_information_revealed || "",
      action_or_dialogue_focus: scene.action_or_dialogue_focus || "",
      visual_manga_moment: scene.visual_manga_moment || "",
      panel_mood: scene.panel_mood || "",
      ending_beat: scene.ending_beat || "",
      custom_scene_details: scene.custom_scene_details || "",
    });
    setEditingScene(scene);
    setShowModal(true);
  }

  function enrichScene(sc: any): any {
    const defaults: any = {
      scene_id: "", chapter_id: "", scene_order: 1, location: "", time: "",
      characters_present: [], scene_goal: "", scene_conflict: "",
      relationship_dynamic_used: "", new_information_revealed: "",
      action_or_dialogue_focus: "", visual_manga_moment: "",
      panel_mood: "", ending_beat: "", custom_scene_details: "",
    };
    const filled = { ...defaults, ...sc };
    if (!Array.isArray(filled.characters_present) && refData.characters) {
      filled.characters_present = refData.characters.map((c: any) => c.name || c);
    }
    return filled;
  }

  function generatedScenes(results: any): any[] {
    const gen = results?.generated_fields || results || {};
    if (Array.isArray(gen.scenes_for_chapter)) return gen.scenes_for_chapter;
    if (Array.isArray(gen.scenes)) return gen.scenes;
    if (Array.isArray(gen.scene_cards)) return gen.scene_cards;
    if (Array.isArray(gen)) return gen;
    return [];
  }

  function normalizeRecommendations(results: any): SceneRecommendation[] {
    const gen = results?.generated_fields || results || {};
    const raw = Array.isArray(gen.scene_count_recommendations)
      ? gen.scene_count_recommendations
      : Array.isArray(gen.recommendations)
        ? gen.recommendations
        : Array.isArray(gen)
          ? gen
          : [];
    return raw
      .filter((rec: any) => rec && rec.chapter_id)
      .map((rec: any) => ({
        chapter_id: rec.chapter_id,
        chapter_number: Number(rec.chapter_number) || chapters.find((ch: any) => ch.chapter_id === rec.chapter_id)?.chapter_number,
        chapter_title: rec.chapter_title || chapters.find((ch: any) => ch.chapter_id === rec.chapter_id)?.chapter_title || "",
        current_scene_count: Number(rec.current_scene_count) || scenes.filter((s: any) => s.chapter_id === rec.chapter_id).length,
        recommended_scene_count: Math.max(1, Math.min(8, Number(rec.recommended_scene_count) || Number(rec.scene_count) || 3)),
        reason: rec.reason || "Recommended from chapter complexity and pacing.",
        must_cover_beats: Array.isArray(rec.must_cover_beats) ? rec.must_cover_beats : [],
      }));
  }

  function handleRecommendSceneCounts() {
    if (selectedChapters.length === 0) {
      alert("Select at least one chapter before asking for recommendations.");
      return;
    }
    setSceneRecommendations([]);
    setSceneRecommendationError(null);
    setAppliedRecChapterIds([]);
    recommendScenes.mutate();
  }

  // Convert one recommendation into actual scene cards. Each must_cover_beat
  // becomes a scene_goal seed; remaining beats are folded into the last scene
  // so nothing is lost. Existing scenes are kept (we APPEND, never overwrite).
  async function applyRecommendation(rec: SceneRecommendation): Promise<{ created: number; skipped: boolean }> {
    const target = Math.max(1, rec.recommended_scene_count || 3);
    const current = Math.max(0, rec.current_scene_count || 0);
    const toCreate = Math.max(0, target - current);
    if (toCreate === 0) return { created: 0, skipped: true };

    const beats = (rec.must_cover_beats || []).filter(Boolean);
    setApplyingRecChapterId(rec.chapter_id);
    try {
      for (let i = 0; i < toCreate; i++) {
        // If beats > slots, fold the leftover beats into the last new scene's goal.
        const isLastSlot = i === toCreate - 1;
        const beatForSlot = isLastSlot && beats.length > toCreate
          ? beats.slice(i).join(" / ")
          : beats[i] || "";
        await api.createScene(storyId, {
          chapter_id: rec.chapter_id,
          location: "",
          time: "",
          characters_present: [],
          scene_goal: beatForSlot,
          scene_conflict: "",
          relationship_dynamic_used: "",
          new_information_revealed: "",
          action_or_dialogue_focus: "",
          visual_manga_moment: "",
          panel_mood: "",
          ending_beat: "",
          custom_scene_details: "",
        });
      }
      setAppliedRecChapterIds((prev) => prev.includes(rec.chapter_id) ? prev : [...prev, rec.chapter_id]);
      return { created: toCreate, skipped: false };
    } finally {
      setApplyingRecChapterId(null);
    }
  }

  async function handleApplyOneRecommendation(rec: SceneRecommendation) {
    try {
      const { created, skipped } = await applyRecommendation(rec);
      if (skipped) {
        alert(`Ch.${rec.chapter_number || "?"} already has the recommended ${rec.recommended_scene_count} scene(s) — nothing to add.`);
        return;
      }
      await plot.refetch();
      alert(`Created ${created} scene placeholder${created === 1 ? "" : "s"} for Ch.${rec.chapter_number || "?"}. Open each one to flesh out details, or run AI Generate Scenes for a full draft.`);
    } catch (e: any) {
      alert(`Failed to apply recommendation: ${e?.message || "unknown error"}`);
    }
  }

  async function handleApplyAllRecommendations() {
    const pending = sceneRecommendations.filter((r) => !appliedRecChapterIds.includes(r.chapter_id));
    if (pending.length === 0) {
      alert("All recommendations have already been applied.");
      return;
    }
    if (!confirm(`Apply ${pending.length} recommendation${pending.length === 1 ? "" : "s"}? This appends scene placeholders to each chapter using the suggested beats. Existing scenes are kept.`)) return;
    setApplyAllRecsRunning(true);
    let createdTotal = 0;
    try {
      for (const rec of pending) {
        const { created } = await applyRecommendation(rec);
        createdTotal += created;
      }
      await plot.refetch();
      alert(`Created ${createdTotal} scene placeholder${createdTotal === 1 ? "" : "s"} across ${pending.length} chapter${pending.length === 1 ? "" : "s"}.`);
    } catch (e: any) {
      alert(`Failed to apply all: ${e?.message || "unknown error"}`);
    } finally {
      setApplyAllRecsRunning(false);
    }
  }

  function handleGenerateScenes() {
    if (!aiSceneFields.includes("scenes_for_chapter")) {
      alert("Select Generate Scenes first.");
      return;
    }
    if (selectedChapters.length === 0) {
      alert("Select at least one chapter for scene generation.");
      return;
    }
    aiGen.mutate();
  }

  async function handleApplyAi(results: any) {
    const generated = generatedScenes(results);
    if (generated.length === 0) {
      alert("AI did not return scene cards. Try again or reduce the selected chapter range.");
      return;
    }
    if (generated.length === 1) {
      const scene = enrichScene(generated[0]);
      setForm((f) => ({
        ...f,
        chapter_id: scene.chapter_id || f.chapter_id,
        scene_order: scene.scene_order || f.scene_order,
        scene_id: scene.scene_id || f.scene_id,
        location: scene.location || "",
        time: scene.time || "",
        characters_present: (scene.characters_present || []).join(", "),
        scene_goal: scene.scene_goal || "",
        scene_conflict: scene.scene_conflict || "",
        relationship_dynamic_used: scene.relationship_dynamic_used || "",
        new_information_revealed: scene.new_information_revealed || "",
        action_or_dialogue_focus: scene.action_or_dialogue_focus || "",
        visual_manga_moment: scene.visual_manga_moment || "",
        panel_mood: scene.panel_mood || "",
        ending_beat: scene.ending_beat || "",
        custom_scene_details: scene.custom_scene_details || "",
      }));
      setShowModal(true);
      setAiSceneResults(null);
      return;
    }

    const validScenes = generated
      .map(enrichScene)
      .filter((sc: any) => sc.chapter_id && selectedChapters.includes(sc.chapter_id));
    if (validScenes.length === 0) {
      alert("Generated scenes did not match the selected chapters.");
      return;
    }
    if (!confirm(`Apply ${validScenes.length} scenes from AI? They will be created in bulk.`)) return;

    setBulkApplying(true);
    try {
      for (const sc of validScenes) {
        await api.createScene(storyId, {
          chapter_id: sc.chapter_id,
          scene_order: sc.scene_order || undefined,
          location: sc.location || "",
          time: sc.time || "",
          characters_present: Array.isArray(sc.characters_present) ? sc.characters_present : [],
          scene_goal: sc.scene_goal || "",
          scene_conflict: sc.scene_conflict || "",
          relationship_dynamic_used: sc.relationship_dynamic_used || "",
          new_information_revealed: sc.new_information_revealed || "",
          action_or_dialogue_focus: sc.action_or_dialogue_focus || "",
          visual_manga_moment: sc.visual_manga_moment || "",
          panel_mood: sc.panel_mood || "",
          ending_beat: sc.ending_beat || "",
          custom_scene_details: sc.custom_scene_details || "",
        });
      }
      setAiSceneResults(null);
      await plot.refetch();
    } finally {
      setBulkApplying(false);
    }
  }

  function submitScene() {
    const body: any = {
      chapter_id: form.chapter_id,
      scene_order: form.scene_order,
      location: form.location,
      time: form.time,
      characters_present: form.characters_present.split(",").map((s) => s.trim()).filter(Boolean),
      scene_goal: form.scene_goal,
      scene_conflict: form.scene_conflict,
      relationship_dynamic_used: form.relationship_dynamic_used,
      new_information_revealed: form.new_information_revealed,
      action_or_dialogue_focus: form.action_or_dialogue_focus,
      visual_manga_moment: form.visual_manga_moment,
      panel_mood: form.panel_mood,
      ending_beat: form.ending_beat,
      custom_scene_details: form.custom_scene_details,
    };
    if (form.scene_id) body.scene_id = form.scene_id;
    createScene.mutate(body);
    setShowModal(false);
  }

  const resultCount = generatedScenes(aiSceneResults).length;

  return (
    <>
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Scene Cards" subtitle="Manage scenes grouped by chapter. Each scene becomes manga panels.">
          <div className="rounded-xl border-2 border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-black">Select chapters for AI generation:</h4>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs font-bold">
                  Scenes/chapter
                  <select className="rounded-lg border-2 border-slate-900 bg-white px-2 py-1 text-xs" value={scenesPerChapter} onChange={(e) => setScenesPerChapter(parseInt(e.target.value) || 3)}>
                    {[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                <button
                  className="rounded-lg border-2 border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={selectedChapters.length === 0 || recommendScenes.isPending}
                  onClick={handleRecommendSceneCounts}
                >
                  {recommendScenes.isPending ? "Reading chapters..." : "Recommend counts"}
                </button>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {chapters.map((ch: any) => (
                <label key={ch.chapter_id} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={selectedChapters.includes(ch.chapter_id)} onChange={(e) => { setSelectedChapters((prev) => e.target.checked ? [...prev, ch.chapter_id] : prev.filter((id) => id !== ch.chapter_id)); }} />
                  Ch.{ch.chapter_number}
                </label>
              ))}
              <button className="ml-2 text-xs font-bold text-indigo-600 underline" onClick={() => setSelectedChapters(chapters.map((ch: any) => ch.chapter_id))}>All</button>
              <button className="ml-1 text-xs font-bold text-slate-500 underline" onClick={() => setSelectedChapters([])}>None</button>
            </div>
            {selectedChapters.length === 0 && <p className="mt-2 text-xs font-bold text-red-600">Select at least one chapter before generating scenes.</p>}
            <p className="mt-2 text-xs font-bold text-slate-500">Recommendations are AI planning notes. Click <span className="rounded bg-indigo-100 px-1 font-black text-indigo-700">Apply</span> on a chapter to seed scene placeholders from the suggested beats — or use <span className="font-black">Generate Scenes</span> below for a full AI draft.</p>
          </div>
          {(sceneRecommendations.length > 0 || sceneRecommendationError) && (
            <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-black text-indigo-900">AI Scene Count Recommendations</h4>
                <div className="flex flex-wrap items-center gap-3">
                  {sceneRecommendations.length > 0 && (
                    <button
                      className="rounded-lg border-2 border-emerald-500 bg-emerald-500 px-3 py-1 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-600"
                      onClick={handleApplyAllRecommendations}
                      disabled={applyAllRecsRunning || applyingRecChapterId !== null || sceneRecommendations.every((r) => appliedRecChapterIds.includes(r.chapter_id))}
                    >
                      {applyAllRecsRunning ? "Applying all..." : "Apply All"}
                    </button>
                  )}
                  <button className="text-xs font-black text-indigo-600 underline" onClick={() => { setSceneRecommendations([]); setAppliedRecChapterIds([]); }}>Clear</button>
                </div>
              </div>
              {sceneRecommendationError && <ErrorBanner error={sceneRecommendationError} onDismiss={() => setSceneRecommendationError(null)} />}
              {sceneRecommendations.length > 0 && (
                <div className="mt-3 space-y-2">
                  {sceneRecommendations.map((rec) => {
                    const current = rec.current_scene_count || 0;
                    const target = rec.recommended_scene_count || 3;
                    const delta = Math.max(0, target - current);
                    const applied = appliedRecChapterIds.includes(rec.chapter_id);
                    const isApplyingThis = applyingRecChapterId === rec.chapter_id;
                    const canApply = delta > 0 && !applied;
                    return (
                      <div key={rec.chapter_id} className={`rounded-lg border p-3 ${applied ? "border-emerald-300 bg-emerald-50" : "border-indigo-200 bg-white"}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-black text-slate-900">Ch.{rec.chapter_number || "?"} - {rec.chapter_title || rec.chapter_id}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-black text-indigo-700">
                              Recommend {target} total scene{target === 1 ? "" : "s"}
                            </span>
                            {applied ? (
                              <span className="rounded-full border-2 border-emerald-400 bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">✓ Applied</span>
                            ) : (
                              <button
                                className="rounded-full border-2 border-emerald-500 bg-emerald-500 px-3 py-1 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-600"
                                onClick={() => handleApplyOneRecommendation(rec)}
                                disabled={!canApply || isApplyingThis || applyAllRecsRunning}
                                title={delta === 0 ? "Already at recommended count" : `Add ${delta} scene placeholder${delta === 1 ? "" : "s"} from these beats`}
                              >
                                {isApplyingThis ? "Applying..." : delta === 0 ? "At target" : `Apply (+${delta})`}
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="mt-1 text-xs font-bold text-slate-500">
                          Current: {current}. Suggested to add: {delta}.
                        </p>
                        {rec.reason && <p className="mt-2 text-xs text-slate-700">{rec.reason}</p>}
                        {rec.must_cover_beats && rec.must_cover_beats.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {rec.must_cover_beats.map((beat) => (
                              <span key={beat} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-bold text-slate-600">{beat}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <AiFillPanel page="scenes" fields={[{ key: "scenes_for_chapter", label: "Generate Scenes", description: "AI creates scene cards for selected chapters based on characters and plot" }]} note="AI reads selected chapters, existing scene counts, characters, and plot outline to generate ordered scene cards." onFieldSelect={setAiSceneFields} onGenerate={handleGenerateScenes} loading={aiGen.isPending || bulkApplying} results={aiSceneResults} onClear={() => setAiSceneResults(null)} onApply={handleApplyAi} disabled={selectedChapters.length === 0} disabledReason="Select at least one chapter before generating scenes." error={aiSceneError} onDismissError={() => setAiSceneError(null)} />
          {aiSceneResults && resultCount === 0 && (
            <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-xs font-bold text-amber-800">
              No scene cards were returned. Try fewer chapters or generate again.
            </div>
          )}
          <div className="space-y-5">
            {chapters.length > 0 ? chapters.map((ch: any) => {
              const chScenes = scenes.filter((s: any) => s.chapter_id === ch.chapter_id);
              return (
                <div key={ch.chapter_id} className="rounded-xl border-2 border-slate-900 bg-white p-4 sm:rounded-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={selectedChapters.includes(ch.chapter_id)} onChange={(e) => { setSelectedChapters((prev) => e.target.checked ? [...prev, ch.chapter_id] : prev.filter((id) => id !== ch.chapter_id)); }} />
                      <span className="font-black">Ch.{ch.chapter_number} - {ch.chapter_title || "Untitled"}</span>
                    </label>
                    <div className="flex gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-500">{chScenes.length} scene{chScenes.length === 1 ? "" : "s"}</span>
                      <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-black text-white sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm" onClick={() => openNew(ch.chapter_id)}>+ Add Scene</button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {chScenes.length > 0 ? chScenes.map((s: any) => (
                      <div key={s.scene_id} className="flex items-start gap-2">
                        <button onClick={() => openEdit(s)} className="flex-1 rounded-lg border border-slate-200 p-3 text-left transition hover:bg-slate-50">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">#{s.scene_order}</span>
                            <span className="text-sm font-bold">{s.location || "No location"}</span>
                            <span className="text-xs text-slate-500">{s.time || "No time"}</span>
                            <span className="text-xs text-slate-400">{s.panel_mood || ""}</span>
                          </div>
                          {s.scene_goal && <p className="mt-1 text-xs text-slate-600">{s.scene_goal}</p>}
                        </button>
                        <button className="mt-2 rounded-lg border border-red-200 bg-white px-2 py-1 text-xs font-bold text-red-500 hover:bg-red-50" disabled={deleteSceneMut.isPending} onClick={() => { if (deleteSceneMut.isPending) return; if (confirm(`Delete scene #${s.scene_order}?`)) deleteSceneMut.mutate(s.scene_id); }}>Delete</button>
                      </div>
                    )) : <p className="text-sm text-slate-400">No scenes yet.</p>}
                  </div>
                </div>
              );
            }) : <p className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-bold text-amber-800">No chapters created yet. Create chapters on the Plot Board first.</p>}
          </div>
        </Panel>
        <Panel title="scene_cards.json"><StructuredJsonView data={content.scene_cards || {}} /></Panel>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border-2 border-slate-900 bg-white p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-lg">{editingScene ? `Edit Scene: ${editingScene.scene_id}` : "New Scene"}</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Chapter ID" value={form.chapter_id} onChange={(v) => setForm((f) => ({ ...f, chapter_id: v }))} />
              <Field label="Scene order" value={String(form.scene_order)} onChange={(v) => setForm((f) => ({ ...f, scene_order: parseInt(v) || 1 }))} />
              <Field label="Location" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
              <Field label="Time" value={form.time} onChange={(v) => setForm((f) => ({ ...f, time: v }))} />
              <div>
                <label className="block text-sm font-black">Characters present</label>
                <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={form.characters_present.split(",").map((s) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setForm((f) => ({ ...f, characters_present: vals.join(", ") })); }}>
                  {(refData.characters || []).map((c: any) => <option key={c.id || c} value={c.name || c}>{c.name || c}</option>)}
                </select>
              </div>
              <Field label="Panel mood" value={form.panel_mood} onChange={(v) => setForm((f) => ({ ...f, panel_mood: v }))} />
              <div className="sm:col-span-2"><Field label="Scene goal" value={form.scene_goal} onChange={(v) => setForm((f) => ({ ...f, scene_goal: v }))} /></div>
              <div className="sm:col-span-2"><Field label="Scene conflict" value={form.scene_conflict} onChange={(v) => setForm((f) => ({ ...f, scene_conflict: v }))} textarea /></div>
              <Field label="Relationship dynamic" value={form.relationship_dynamic_used} onChange={(v) => setForm((f) => ({ ...f, relationship_dynamic_used: v }))} />
              <Field label="Action/dialogue focus" value={form.action_or_dialogue_focus} onChange={(v) => setForm((f) => ({ ...f, action_or_dialogue_focus: v }))} />
              <Field label="New information revealed" value={form.new_information_revealed} onChange={(v) => setForm((f) => ({ ...f, new_information_revealed: v }))} />
              <Field label="Visual manga moment" value={form.visual_manga_moment} onChange={(v) => setForm((f) => ({ ...f, visual_manga_moment: v }))} />
              <Field label="Ending beat" value={form.ending_beat} onChange={(v) => setForm((f) => ({ ...f, ending_beat: v }))} />
              <div className="sm:col-span-2"><Field label="Custom details" value={form.custom_scene_details} onChange={(v) => setForm((f) => ({ ...f, custom_scene_details: v }))} textarea /></div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={submitScene} disabled={createScene.isPending}>{editingScene ? "Update Scene" : "Create Scene"}</button>
              <button className="rounded-xl border-2 border-slate-400 bg-white px-5 py-3 text-sm font-black text-slate-600" onClick={() => setShowModal(false)}>Cancel</button>
              {editingScene && <button className="rounded-xl border-2 border-red-400 bg-white px-5 py-3 text-sm font-black text-red-500" disabled={deleteSceneMut.isPending} onClick={() => { if (deleteSceneMut.isPending) return; if (confirm(`Delete scene #${editingScene.scene_order}?`)) { deleteSceneMut.mutate(editingScene.scene_id); setShowModal(false); } }}>Delete Scene</button>}
              {createScene.isError && <ErrorBanner error={createScene.error as Error} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
