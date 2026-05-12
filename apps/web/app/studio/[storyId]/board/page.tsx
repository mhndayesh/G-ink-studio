"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getExpansionText, getUsableAiOutput } from "@/lib/aiResults";
import { useHydrateOnce } from "@/lib/hooks/useHydrate";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { OptionGrid } from "@/components/forms/OptionGrid";
import { AiButton } from "@/components/forms/AiButton";
import { AiFillPanel } from "@/components/forms/AiFillPanel";
import { CustomInput } from "@/components/forms/CustomInput";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { useStudioStore } from "@/lib/store";
import {
  ARC_LENGTH_OPTS,
  ARC_LENGTH_SPECS,
  STRUCTURE_BEATS,
  CHAPTER_CONTENT_FIELDS,
  hasContent,
  isMeaningfulChapter,
  selectedOptionValue,
} from "./boardModel";

export default function PlotBoardPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const queryClient = useQueryClient();
  const integrityLock = useStudioStore((s) => s.integrityLock);
  const setIntegrityLock = useStudioStore((s) => s.setIntegrityLock);
  const plot = useQuery({ queryKey: ["plot", storyId], queryFn: () => api.getPlotOutline(storyId) });
  const refs = useQuery({ queryKey: ["refs", storyId], queryFn: () => api.getReferences(storyId) });
  const chars = useQuery({ queryKey: ["characters", storyId], queryFn: () => api.getCharacters(storyId), enabled: false });
  const refData = (refs.data || {}) as any;
  const content = (plot.data?.content || plot.data || {}) as any;
  const [structure, setStructure] = useState("");
  const [customStructure, setCustomStructure] = useState("");
  const [arcSummary, setArcSummary] = useState("");
  const [aiPlot, setAiPlot] = useState<any>(null);
  const [aiPlotError, setAiPlotError] = useState<string | null>(null);
  const [aiBoardFields, setAiBoardFields] = useState<string[]>([]);
  const [aiBoardResults, setAiBoardResults] = useState<Record<string, any> | null>(null);
  const [aiBoardError, setAiBoardError] = useState<string | null>(null);
  const [showRedoModal, setShowRedoModal] = useState(false);
  const [redoStructure, setRedoStructure] = useState("");
  const [redoCustomStructure, setRedoCustomStructure] = useState("");
  const [redoConfirmation, setRedoConfirmation] = useState("");

  // Chapter modal state
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [chapterForm, setChapterForm] = useState({ chapter_id: "", arc_title: "", chapter_title: "", chapter_purpose: "", structure_section: "", summary: "", characters_present: "", relationships_used: "", factions_used: "", threats_used: "", world_rules_shown: "", power_system_shown: "", main_conflict: "", emotional_beat: "", twist_or_hook: "", ending_cliffhanger: "", custom_chapter_details: "" });

  // Arc overview state
  const [arcForm, setArcForm] = useState({ arc_title: "", arc_number: 1, arc_type: "", arc_length_type: "", starting_status_quo: "", main_story_question: "", central_emotional_question: "", main_external_conflict: "", main_internal_conflict: "", main_relationship_conflict: "", main_threat_used: "", ending_type_target: "" });

  // Structure editors state - Kishotenketsu
  const [ki, setKi] = useState({ initial_mystery_or_question: "", opening_image: "", chapter_range: "" });
  const [sho, setSho] = useState({ tension_growth: "", chapter_range: "" });
  const [ten, setTen] = useState({ main_twist: "", hidden_truth_revealed: "", major_threat_recontextualized: "", relationship_reversal: "", character_arc_turning_point: "", chapter_range: "" });
  const [ketsu, setKetsu] = useState({ conflict_resolution: "", emotional_resolution: "", relationship_resolution: "", world_state_after_arc: "", character_final_state: "", chapter_range: "" });

  // Structure editors state - Three-Act
  const [act1, setAct1] = useState({ opening_hook: "", normal_world: "", inciting_incident: "", first_major_choice: "", main_goal_locked: "", chapter_range: "" });
  const [act2, setAct2] = useState({ midpoint_reveal_or_defeat: "", stakes_increase: "", chapter_range: "" });
  const [act3, setAct3] = useState({ darkest_moment: "", final_plan_or_breakthrough: "", climax_battle_or_confrontation: "", major_threat_outcome: "", character_arc_payoff: "", relationship_payoff: "", ending_image: "", chapter_range: "" });

  // Hydrate form state from saved JSON exactly once per story.
  useHydrateOnce(!!plot.data, storyId, () => {
    const c = (plot.data?.content || plot.data || {}) as any;
    setStructure(c.narrative_structure?.selected || "");
    setCustomStructure(c.narrative_structure?.custom_structure || "");
    const ao = c.story_arc_overview || {};
    setArcSummary(ao.arc_summary || "");
    setArcForm((f) => ({
      ...f,
      arc_title: ao.arc_title || "",
      arc_number: ao.arc_number || 1,
      arc_type: ao.arc_type || "",
      arc_length_type: selectedOptionValue(ao.arc_length_type),
      starting_status_quo: ao.starting_status_quo || "",
      main_story_question: ao.main_story_question || "",
      central_emotional_question: ao.central_emotional_question || "",
      main_external_conflict: ao.main_external_conflict || "",
      main_internal_conflict: ao.main_internal_conflict || "",
      main_relationship_conflict: ao.main_relationship_conflict || "",
      main_threat_used: ao.main_threat_used || "",
      ending_type_target: ao.ending_type_target || "",
    }));
    const ko = c.kishotenketsu_outline || {};
    if (ko.ki_introduction) setKi((f) => ({ ...f, ...ko.ki_introduction }));
    if (ko.sho_development) setSho((f) => ({ ...f, ...ko.sho_development }));
    if (ko.ten_twist_or_turn) setTen((f) => ({ ...f, ...ko.ten_twist_or_turn }));
    if (ko.ketsu_conclusion) setKetsu((f) => ({ ...f, ...ko.ketsu_conclusion }));
    const co = c.conflict_driven_outline || {};
    if (co.act_1_setup) setAct1((f) => ({ ...f, ...co.act_1_setup }));
    if (co.act_2_escalation) setAct2((f) => ({ ...f, ...co.act_2_escalation }));
    if (co.act_3_climax_resolution) setAct3((f) => ({ ...f, ...co.act_3_climax_resolution }));
  });

  function refreshArcDependentData() {
    plot.refetch().then(() => {
      const fresh = (plot.data?.content || plot.data || {}) as any;
      setStructure(fresh.narrative_structure?.selected || "");
      setCustomStructure(fresh.narrative_structure?.custom_structure || "");
    });
    void queryClient.invalidateQueries({ queryKey: ["arcCompletion", storyId] });
    void queryClient.invalidateQueries({ queryKey: ["chapterScript", storyId] });
    void queryClient.invalidateQueries({ queryKey: ["script", storyId] });
  }

  const patchStructure = useMutation({ mutationFn: (body: any) => api.patchNarrativeStructure(storyId, body), onSuccess: () => refreshArcDependentData() });
  const patchArc = useMutation({ mutationFn: (body: any) => api.patchArcOverview(storyId, body), onSuccess: () => plot.refetch() });

  // Run a sequence of arc-overview patches against plot_outline.json without
  // firing a refetch after each one. Backend patches are read-modify-write —
  // Promise.all would race and lose writes. Always sequential.
  const saveAllArc = useMutation({
    mutationFn: async (patches: Array<{ target_branch: string; operation: string; value: any }>) => {
      for (const body of patches) {
        await api.patchArcOverview(storyId, body);
      }
    },
    onSuccess: () => plot.refetch(),
  });
  const createChapter = useMutation({
    mutationFn: (body: any) => api.createChapter(storyId, body),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["status", storyId] });
      refreshArcDependentData();
      setShowChapterModal(false);
      // Auto-save arc overview so the board reflects the created chapter's arc
      const arcOps = buildArcPatchOps();
      for (const op of arcOps) {
        await api.patchArcOverview(storyId, op).catch(() => {});
      }
      // Auto-analyze and apply relationship changes (silent, non-blocking)
      try {
        const relResult = await api.analyzeRelationships(storyId) as any;
        const proposals = relResult?.proposed_relationships || [];
        if (proposals.length > 0) {
          await api.applyRelationships(storyId, proposals);
          void chars.refetch();
        }
      } catch { /* silent — relationship analysis is best-effort */ }
    },
  });
  const aiExpand = useMutation({
    mutationFn: () => api.aiComplete(storyId, { expansion_mode: "Light Expansion", text: arcSummary }),
    onSuccess: (data) => {
      if (!getExpansionText(data)) {
        setAiPlot(null);
        setAiPlotError(AI_EMPTY_MESSAGE);
        return;
      }
      setAiPlotError(null);
      setAiPlot(data);
    },
    onError: (err: any) => {
      setAiPlot(null);
      setAiPlotError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string; number: number; isLast: boolean } | null>(null);
  const deleteChapterMut = useMutation({
    mutationFn: (chId: string) => api.deleteChapter(storyId, chId),
    onSuccess: (data) => {
      refreshArcDependentData();
      setDeleteTarget(null);
      if (data?.integrity_lock) setIntegrityLock(data.integrity_lock);
    },
  });
  const advanceLockMut = useMutation({
    mutationFn: (chNum: number) => api.advanceLock(storyId, chNum),
    onSuccess: (data) => {
      refreshArcDependentData();
      if (data?.integrity_lock) setIntegrityLock(data.integrity_lock);
    },
  });
  const analyzeRels = useMutation({ mutationFn: () => api.analyzeRelationships(storyId), onSuccess: (d: any) => { const props = d?.proposed_relationships || []; setRelProposals(props); } });
  const applyRels = useMutation({ mutationFn: (rels: any[]) => api.applyRelationships(storyId, rels), onSuccess: () => { setRelProposals([]); void chars.refetch(); } });
  const [relProposals, setRelProposals] = useState<any[] | null>(null);
  const redoArcMut = useMutation({
    mutationFn: () => api.redoArcStructure(storyId, {
      selected: redoStructure,
      custom_structure: redoCustomStructure,
      preserve_arc_overview: true,
      clear_chapter_script: true,
      confirmation: redoConfirmation,
    }),
    onSuccess: (data) => {
      setStructure(redoStructure);
      setCustomStructure(redoCustomStructure);
      setKi({ initial_mystery_or_question: "", opening_image: "", chapter_range: "" });
      setSho({ tension_growth: "", chapter_range: "" });
      setTen({ main_twist: "", hidden_truth_revealed: "", major_threat_recontextualized: "", relationship_reversal: "", character_arc_turning_point: "", chapter_range: "" });
      setKetsu({ conflict_resolution: "", emotional_resolution: "", relationship_resolution: "", world_state_after_arc: "", character_final_state: "", chapter_range: "" });
      setAct1({ opening_hook: "", normal_world: "", inciting_incident: "", first_major_choice: "", main_goal_locked: "", chapter_range: "" });
      setAct2({ midpoint_reveal_or_defeat: "", stakes_increase: "", chapter_range: "" });
      setAct3({ darkest_moment: "", final_plan_or_breakthrough: "", climax_battle_or_confrontation: "", major_threat_outcome: "", character_arc_payoff: "", relationship_payoff: "", ending_image: "", chapter_range: "" });
      if (data?.integrity_lock) setIntegrityLock(data.integrity_lock);
      setShowRedoModal(false);
      setRedoConfirmation("");
      refreshArcDependentData();
    },
  });

  // Arc completion check (deterministic + optional LLM).
  // Key off the SAVED arc title from content (stable until plot.refetch) to avoid
  // double-firing when form hydration changes arcForm.arc_title a split-second after
  // plot.data arrives. The form value is only used for display, not for the query key.
  const savedArcTitle: string = content?.story_arc_overview?.arc_title || "";
  const activeArcTitle = arcForm.arc_title || savedArcTitle;
  const chapters: any[] = content?.chapter_or_episode_list?.chapters ?? [];
  const meaningfulChapters = chapters.filter(isMeaningfulChapter);
  const chapterCount = meaningfulChapters.length;
  const arcCompletion = useQuery({
    queryKey: ["arcCompletion", storyId, savedArcTitle, content?.narrative_structure?.selected || "", chapterCount],
    queryFn: () => api.checkArcCompletion(storyId, savedArcTitle || undefined),
    // Only fire when chapters actually exist — skip the LLM round-trip for empty outlines.
    enabled: !!plot.data && chapterCount > 0,
    staleTime: 60_000,
  });
  const [extendBypass, setExtendBypass] = useState(false);
  // Reset the one-shot bypass whenever the active arc changes — it's a
  // single-chapter override, not a permanent silence.
  useEffect(() => { setExtendBypass(false); }, [activeArcTitle]);
  const arcStatusComplete = arcCompletion.data?.is_complete === true;
  const selectedArcLength = arcForm.arc_length_type;
  const arcLengthSelected = !!String(selectedArcLength).trim();
  const selectedStructure = structure || content?.narrative_structure?.selected || "";
  const activeStructureBeats = STRUCTURE_BEATS[selectedStructure] || [];
  const arcLengthSpec = ARC_LENGTH_SPECS[selectedArcLength] || ARC_LENGTH_SPECS.Custom;
  const arcChapterCount = meaningfulChapters.length;
  const atIdealChapterCount = arcChapterCount >= arcLengthSpec.ideal;
  const atMaxChapterCount = arcChapterCount >= arcLengthSpec.max;
  const structureSelected = !!String(selectedStructure).trim() && (selectedStructure !== "Custom" || !!String(customStructure).trim());
  const aiPrereqsMet = arcLengthSelected && structureSelected;
  const aiPrereqsMessage = !arcLengthSelected && !structureSelected
    ? "Please choose arc length and narrative structure before AI can generate."
    : !arcLengthSelected
    ? "Please choose arc length before AI can generate."
    : !structureSelected
    ? "Please choose narrative structure before AI can generate."
    : "";
  const arcLengthRequiredMessage = "Please choose arc length before saving the board, generating structure, or creating chapters.";

  function requireArcLength(): boolean {
    if (arcLengthSelected) return true;
    alert("Please choose arc length.");
    return false;
  }
  function requireAiPrereqs(): boolean {
    if (!arcLengthSelected) { alert("Please choose arc length first."); return false; }
    if (!structureSelected) { alert("Please choose narrative structure first."); return false; }
    return true;
  }

  // Live-save narrative structure on click so the LLM sees the choice
  // in plot_outline.json context (not only via hints) and downstream
  // queries (arc completion, structure plan) refresh immediately.
  function handleSelectStructure(value: string) {
    setStructure(value);
    if (!value) return;
    if (value === "Custom") return; // wait for customStructure to be entered
    patchStructure.mutate({ selected: value, custom_structure: "" });
  }
  function handleCustomStructureChange(value: string) {
    setCustomStructure(value);
    if (structure === "Custom" && value.trim()) {
      patchStructure.mutate({ selected: "Custom", custom_structure: value });
    }
  }
  function handleSelectArcLength(value: string) {
    setArcForm((f) => ({ ...f, arc_length_type: value }));
    if (!value) return;
    patchArc.mutate({ target_branch: "story_arc_overview.arc_length_type.selected", operation: "replace", value });
  }

  function arcLengthGuidance(length: string): string {
    const guides: Record<string, string> = {
      "One-Shot": "Target a complete one-chapter arc.",
      "Short Arc": "Target a compact 3-5 chapter arc with quick setup, escalation, reveal, and payoff.",
      "Medium Arc": "Target roughly 6-10 chapters with clear midpoint pressure and a strong final payoff.",
      "Long Arc": "Target roughly 11-16 chapters with multiple escalation turns before the climax.",
      "Saga": "Target a large multi-phase arc with several sub-conflicts feeding one major payoff.",
      "Season": "Target a season-length arc with opening, middle pressure, finale, and hook for the next arc.",
      "Full Series": "Treat the structure as a full-series spine with major act breaks and long-term payoff.",
      "Custom": "Use the user's custom arc length intent and keep chapter pacing consistent with it.",
    };
    return guides[length] || "";
  }

  function handleStartNewArc() {
    if (!confirm("Start a new arc? This clears the arc overview form. Existing chapters and saved data are not deleted.")) return;
    const nextArcNum = (content.story_arc_overview?.arc_number || arcForm.arc_number || 1) + 1;
    setArcForm({ arc_title: "", arc_number: nextArcNum, arc_type: "", arc_length_type: "", starting_status_quo: "", main_story_question: "", central_emotional_question: "", main_external_conflict: "", main_internal_conflict: "", main_relationship_conflict: "", main_threat_used: "", ending_type_target: "" });
    setArcSummary("");
    setExtendBypass(false);
  }
  function handleExtendArc() {
    setExtendBypass(true);
  }
  function handleAiNextChapterClick() {
    if (!requireAiPrereqs()) return;
    if (atMaxChapterCount && !extendBypass) {
      alert(`This ${selectedArcLength} is already at its planned maximum (${arcLengthSpec.label}). Use Extend Current Arc once if you intentionally want to go beyond it.`);
      return;
    }
    if (arcStatusComplete && !extendBypass) {
      // Hard gate: surface the choice, don't silently extend.
      alert("This arc looks complete. Use Start New Arc, or click Extend Arc once before generating another chapter.");
      return;
    }
    aiNextChapter.mutate();
    // The bypass is single-use — the next call requires another explicit Extend.
    if (extendBypass) setExtendBypass(false);
  }

  function buildChapterGenHints(): any {
    const chapters: any[] = (content.chapter_or_episode_list?.chapters || []).filter(isMeaningfulChapter);
    const nextNum = Math.max(0, ...chapters.map((ch) => Number(ch.chapter_number) || 0)) + 1;
    const arcTitle = arcForm.arc_title || content.story_arc_overview?.arc_title || "Untitled Arc";
    const hints: any = {
      chapter_number: nextNum,
      chapter_id: `ch_${String(nextNum).padStart(3, "0")}`,
      arc_title: arcTitle,
      arc_length_type: selectedArcLength,
      arc_length_guidance: arcLengthGuidance(selectedArcLength),
      target_chapter_min: arcLengthSpec.min,
      target_chapter_ideal: arcLengthSpec.ideal,
      target_chapter_max: arcLengthSpec.max,
      target_chapter_label: arcLengthSpec.label,
      structure_type: selectedStructure,
      structure_beats: activeStructureBeats,
      preferred_next_structure_section: activeStructureBeats.length > 0
        ? activeStructureBeats[Math.min(activeStructureBeats.length - 1, Math.floor((nextNum - 1) * activeStructureBeats.length / Math.max(arcLengthSpec.ideal, 1)))].key
        : undefined,
      existing_chapter_count: chapters.length,
    };
    if (chapters.length > 0) {
      const lastCh = chapters[chapters.length - 1];
      hints.last_chapter_title = lastCh.chapter_title || "";
      hints.last_chapter_summary = lastCh.summary || "";
      hints.last_chapter_cliffhanger = lastCh.ending_cliffhanger || "";
    }
    return hints;
  }
  function buildArcGenHints(): any {
    const currentArc = content.story_arc_overview || {};
    const hasArc = !!(currentArc.arc_title || currentArc.arc_summary);
    const hints: any = {};
    if (hasArc) {
      hints.arc_number = currentArc.arc_number || 1;
      hints.arc_title = currentArc.arc_title || "";
      hints.arc_type = currentArc.arc_type || "";
    } else {
      hints.arc_number = 1;
    }
    if (arcForm.arc_title) hints.arc_title = arcForm.arc_title;
    if (arcForm.arc_type) hints.arc_type = arcForm.arc_type;
    if (selectedArcLength) {
      hints.arc_length_type = selectedArcLength;
      hints.arc_length_guidance = arcLengthGuidance(selectedArcLength);
      hints.target_chapter_min = arcLengthSpec.min;
      hints.target_chapter_ideal = arcLengthSpec.ideal;
      hints.target_chapter_max = arcLengthSpec.max;
      hints.target_chapter_label = arcLengthSpec.label;
    }
    if (arcSummary) hints.arc_summary_hint = arcSummary;
    return hints;
  }
  function buildBoardGenHints(): any {
    const hints: any = {};
    if (aiBoardFields.includes("arc_overview")) Object.assign(hints, buildArcGenHints());
    if (aiBoardFields.includes("chapters")) Object.assign(hints, buildChapterGenHints());
    if (aiBoardFields.includes("structure") && selectedArcLength) {
      hints.arc_length_type = selectedArcLength;
      hints.arc_length_guidance = arcLengthGuidance(selectedArcLength);
      hints.target_chapter_min = arcLengthSpec.min;
      hints.target_chapter_ideal = arcLengthSpec.ideal;
      hints.target_chapter_max = arcLengthSpec.max;
      hints.target_chapter_label = arcLengthSpec.label;
      hints.structure_type = selectedStructure;
      hints.structure_beats = activeStructureBeats;
      hints.structure_order = "Use arc overview and selected arc length first, then distribute structure beats before chapter generation.";
    }
    return hints;
  }
  /** Force-override chapter_id and chapter_number from computed hints — never trust the LLM for these. */
  function forceChapterIdentity(ch: any): any {
    const hints = buildChapterGenHints();
    if (hints.chapter_id) ch.chapter_id = hints.chapter_id;
    if (hints.chapter_number) ch.chapter_number = hints.chapter_number;
    if (hints.arc_title && !ch.arc_title) ch.arc_title = hints.arc_title;
    return ch;
  }
  const aiGen = useMutation({
    mutationFn: () => api.aiGenerate(storyId, { page: "board", target_fields: aiBoardFields, partial_input: {}, generation_hints: buildBoardGenHints() }),
    onSuccess: (d: any) => {
      try {
        const gen = getUsableAiOutput("board", aiBoardFields, d);
        setAiBoardError(null);
        setAiBoardResults(gen);
      } catch (err: any) {
        setAiBoardResults(null);
        setAiBoardError(err?.message || AI_EMPTY_MESSAGE);
      }
    },
    onError: (err: any) => {
      setAiBoardResults(null);
      setAiBoardError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });
  const aiNextChapter = useMutation({
    mutationFn: () => api.aiGenerate(storyId, { page: "board", target_fields: ["chapters"], partial_input: {}, generation_hints: buildChapterGenHints() }),
    onSuccess: (d: any) => {
      let gen: Record<string, any>;
      try {
        gen = getUsableAiOutput("board", ["chapters"], d);
        setAiBoardError(null);
      } catch (err: any) {
        setAiBoardError(err?.message || AI_EMPTY_MESSAGE);
        return;
      }
      if (gen.chapters && Array.isArray(gen.chapters) && gen.chapters.length > 0) {
        const ch = forceChapterIdentity(enrichChapter(gen.chapters[0]));
        if (Array.isArray(ch.characters_present)) ch.characters_present = ch.characters_present.filter(Boolean).join(", ");
        if (Array.isArray(ch.factions_used)) ch.factions_used = ch.factions_used.filter(Boolean).join(", ");
        if (Array.isArray(ch.threats_used)) ch.threats_used = ch.threats_used.filter(Boolean).join(", ");
        if (Array.isArray(ch.relationships_used)) ch.relationships_used = ch.relationships_used.filter(Boolean).join(", ");
        if (Array.isArray(ch.world_rules_shown)) ch.world_rules_shown = ch.world_rules_shown.filter(Boolean).join(", ");
        if (Array.isArray(ch.power_system_shown)) ch.power_system_shown = ch.power_system_shown.filter(Boolean).join(", ");
        setChapterForm(f => ({ ...f, ...ch }));
        setShowChapterModal(true);
      } else {
        const flatCh = forceChapterIdentity(enrichChapter(gen));
        const chapterKeys = ["chapter_title","chapter_purpose","structure_section","summary","characters_present","factions_used","threats_used","relationships_used","world_rules_shown","power_system_shown","main_conflict","emotional_beat","twist_or_hook","ending_cliffhanger","custom_chapter_details"];
        if (chapterKeys.some(k => k in gen)) {
          setChapterForm(f => ({ ...f, ...flatCh }));
          setShowChapterModal(true);
        }
      }
    },
    onError: (err: any) => setAiBoardError(err?.message || "AI request failed. Retry in a minute or fill manually."),
  });

  function handleAiBoardGenerate() {
    if (!requireAiPrereqs()) return;
    aiGen.mutate();
  }

  function enrichArc(ao: any): any {
    return {
      arc_title: "", arc_type: "", arc_number: 1, arc_length_type: "",
      arc_summary: "", starting_status_quo: "",
      main_story_question: "", central_emotional_question: "",
      main_external_conflict: "", main_internal_conflict: "",
      main_relationship_conflict: "", main_threat_used: "",
      minor_threats_used: [], main_factions_used: [],
      main_characters_used: [], relationships_used: [],
      ending_type_target: "", custom_arc_overview_details: "",
      ...ao,
      // LLM may return arc_length_type as { selected: "..." } — normalize to string
      arc_length_type: selectedOptionValue(ao?.arc_length_type ?? ""),
    };
  }

  function enrichChapter(ch: any): any {
    const defaults: any = {
      chapter_id: "", arc_title: "", chapter_title: "", structure_section: "", chapter_purpose: "", summary: "",
      main_conflict: "", emotional_beat: "", twist_or_hook: "", ending_cliffhanger: "",
      characters_present: [], factions_used: [], threats_used: [],
      relationships_used: [], world_rules_shown: [], power_system_shown: [],
      custom_chapter_details: "",
    };
    const filled = { ...defaults, ...ch };
    const refData = (refs.data || {}) as any;
    if (!Array.isArray(filled.characters_present) && refData.characters) {
      filled.characters_present = refData.characters.map((c: any) => c.name || c);
    }
    if (!Array.isArray(filled.factions_used) && refData.factions) {
      filled.factions_used = refData.factions;
    }
    if (!Array.isArray(filled.threats_used) && refData.threats) {
      filled.threats_used = refData.threats;
    }
    return filled;
  }

  function handleApplyAi(results: any) {
    const gen = results?.generated_fields || results || {};
    if (gen.arc_overview) {
      const ao = enrichArc(gen.arc_overview);
      setArcForm(f => ({ ...f, ...ao }));
      if (ao.arc_summary) setArcSummary(ao.arc_summary);
    }

    const chapterKeys = ["chapter_title","chapter_purpose","structure_section","summary","characters_present","factions_used","threats_used","relationships_used","world_rules_shown","power_system_shown","main_conflict","emotional_beat","twist_or_hook","ending_cliffhanger","custom_chapter_details"];
    const hasFlatChapter = chapterKeys.some(k => k in gen);

    if (hasFlatChapter) {
      const ch = forceChapterIdentity(enrichChapter(gen));
      for (const k of chapterKeys) if (k in gen && k !== "chapter_title" && k !== "chapter_purpose") ch[k] = gen[k];
      if (Array.isArray(ch.characters_present)) ch.characters_present = ch.characters_present.filter(Boolean).join(", ");
      if (Array.isArray(ch.factions_used)) ch.factions_used = ch.factions_used.filter(Boolean).join(", ");
      if (Array.isArray(ch.threats_used)) ch.threats_used = ch.threats_used.filter(Boolean).join(", ");
      if (Array.isArray(ch.relationships_used)) ch.relationships_used = ch.relationships_used.filter(Boolean).join(", ");
      if (Array.isArray(ch.world_rules_shown)) ch.world_rules_shown = ch.world_rules_shown.filter(Boolean).join(", ");
      if (Array.isArray(ch.power_system_shown)) ch.power_system_shown = ch.power_system_shown.filter(Boolean).join(", ");
      setChapterForm(f => ({ ...f, ...ch }));
      setShowChapterModal(true);
    } else if (gen.chapters && Array.isArray(gen.chapters) && gen.chapters.length > 0) {
      const ch = forceChapterIdentity(enrichChapter(gen.chapters[0]));
      if (Array.isArray(ch.characters_present)) ch.characters_present = ch.characters_present.filter(Boolean).join(", ");
      if (Array.isArray(ch.factions_used)) ch.factions_used = ch.factions_used.filter(Boolean).join(", ");
      if (Array.isArray(ch.threats_used)) ch.threats_used = ch.threats_used.filter(Boolean).join(", ");
      if (Array.isArray(ch.relationships_used)) ch.relationships_used = ch.relationships_used.filter(Boolean).join(", ");
      if (Array.isArray(ch.world_rules_shown)) ch.world_rules_shown = ch.world_rules_shown.filter(Boolean).join(", ");
      if (Array.isArray(ch.power_system_shown)) ch.power_system_shown = ch.power_system_shown.filter(Boolean).join(", ");
      setChapterForm(f => ({ ...f, ...ch }));
      setShowChapterModal(true);
    }
    if (gen.structure) {
      const s = gen.structure;
      if (s.kishotenketsu_outline) {
        const ko = s.kishotenketsu_outline;
        if (ko.ki_introduction) setKi(f => ({ ...f, ...ko.ki_introduction }));
        if (ko.sho_development) setSho(f => ({ ...f, ...ko.sho_development }));
        if (ko.ten_twist_or_turn) setTen(f => ({ ...f, ...ko.ten_twist_or_turn }));
        if (ko.ketsu_conclusion) setKetsu(f => ({ ...f, ...ko.ketsu_conclusion }));
      }
      if (s.conflict_driven_outline) {
        const co = s.conflict_driven_outline;
        if (co.act_1_setup) setAct1(f => ({ ...f, ...co.act_1_setup }));
        if (co.act_2_escalation) setAct2(f => ({ ...f, ...co.act_2_escalation }));
        if (co.act_3_climax_resolution) setAct3(f => ({ ...f, ...co.act_3_climax_resolution }));
      }
    }
    setAiBoardResults(null);
  }

  function buildArcPatchOps() {
    const ops: Array<{ target_branch: string; operation: string; value: any }> = [];
    for (const [key, val] of Object.entries(arcForm)) {
      if (val !== "" && val !== null && val !== undefined) {
        const leaf = key === "arc_length_type" ? "arc_length_type.selected" : key;
        ops.push({ target_branch: `story_arc_overview.${leaf}`, operation: "replace", value: val });
      }
    }
    return ops;
  }

  async function saveBoard() {
    if (!requireArcLength()) return;
    const arcOps = buildArcPatchOps();
    if (arcOps.length) await saveAllArc.mutateAsync(arcOps);
    if (structure) await patchStructure.mutateAsync({ selected: structure, custom_structure: structure === "Custom" ? customStructure : "" });
    if (arcSummary) await patchArc.mutateAsync({ target_branch: "story_arc_overview.arc_summary", operation: "replace", value: arcSummary });
  }

  function saveAllArcFields() {
    if (!requireArcLength()) return;
    const ops = buildArcPatchOps();
    if (ops.length) saveAllArc.mutate(ops);
  }

  function saveStructureEditors() {
    if (!requireArcLength()) return;
    const prefixKi = "kishotenketsu_outline";
    const prefixCf = "conflict_driven_outline";
    const ops: Array<{ target_branch: string; operation: string; value: any }> = [];

    if (structure === "Kishotenketsu") {
      for (const [key, val] of Object.entries(ki)) if (val) ops.push({ target_branch: `${prefixKi}.ki_introduction.${key}`, operation: "replace", value: val });
      for (const [key, val] of Object.entries(sho)) if (val) ops.push({ target_branch: `${prefixKi}.sho_development.${key}`, operation: "replace", value: val });
      for (const [key, val] of Object.entries(ten)) if (val) ops.push({ target_branch: `${prefixKi}.ten_twist_or_turn.${key}`, operation: "replace", value: val });
      for (const [key, val] of Object.entries(ketsu)) if (val) ops.push({ target_branch: `${prefixKi}.ketsu_conclusion.${key}`, operation: "replace", value: val });
    }
    if (structure === "Three-Act Structure") {
      for (const [key, val] of Object.entries(act1)) if (val) ops.push({ target_branch: `${prefixCf}.act_1_setup.${key}`, operation: "replace", value: val });
      for (const [key, val] of Object.entries(act2)) if (val) ops.push({ target_branch: `${prefixCf}.act_2_escalation.${key}`, operation: "replace", value: val });
      for (const [key, val] of Object.entries(act3)) if (val) ops.push({ target_branch: `${prefixCf}.act_3_climax_resolution.${key}`, operation: "replace", value: val });
    }
    if (structure === "Hero's Journey") {
      for (const [key, val] of Object.entries(act1)) if (val) ops.push({ target_branch: `${prefixCf}.act_1_setup.${key}`, operation: "replace", value: val });
      for (const [key, val] of Object.entries(act3)) if (val) ops.push({ target_branch: `${prefixCf}.act_3_climax_resolution.${key}`, operation: "replace", value: val });
    }
    if (ops.length) saveAllArc.mutate(ops);
  }

  function openEditChapter(ch: any) {
    setChapterForm({
      chapter_id: ch.chapter_id || "",
      arc_title: ch.arc_title || arcForm?.arc_title || "",
      chapter_title: ch.chapter_title || "",
      chapter_purpose: ch.chapter_purpose || "",
      structure_section: ch.structure_section || "",
      summary: ch.summary || "",
      characters_present: (Array.isArray(ch.characters_present) ? ch.characters_present.join(", ") : ch.characters_present || ""),
      relationships_used: (Array.isArray(ch.relationships_used) ? ch.relationships_used.join(", ") : ch.relationships_used || ""),
      factions_used: (Array.isArray(ch.factions_used) ? ch.factions_used.join(", ") : ch.factions_used || ""),
      threats_used: (Array.isArray(ch.threats_used) ? ch.threats_used.join(", ") : ch.threats_used || ""),
      world_rules_shown: (Array.isArray(ch.world_rules_shown) ? ch.world_rules_shown.join(", ") : ch.world_rules_shown || ""),
      power_system_shown: (Array.isArray(ch.power_system_shown) ? ch.power_system_shown.join(", ") : ch.power_system_shown || ""),
      main_conflict: ch.main_conflict || "",
      emotional_beat: ch.emotional_beat || "",
      twist_or_hook: ch.twist_or_hook || "",
      ending_cliffhanger: ch.ending_cliffhanger || "",
      custom_chapter_details: ch.custom_chapter_details || "",
    });
    setShowChapterModal(true);
  }

  function submitChapter() {
    if (!requireArcLength()) return;
    const form = chapterForm as any;
    const body: any = {};
    // String identity fields
    if (form.chapter_id) body.chapter_id = String(form.chapter_id);
    body.arc_title = String(form.arc_title || arcForm?.arc_title || "");
    // Optional integer (Pydantic ge=1, le=10000)
    const cn = form.chapter_number;
    if (cn !== undefined && cn !== null && cn !== "") {
      const n = typeof cn === "number" ? cn : parseInt(String(cn), 10);
      if (Number.isInteger(n) && n >= 1 && n <= 10000) body.chapter_number = n;
    }
    // String content fields
    const stringFields = ["chapter_title", "chapter_purpose", "structure_section", "summary", "main_conflict", "emotional_beat", "twist_or_hook", "ending_cliffhanger", "custom_chapter_details"] as const;
    for (const k of stringFields) {
      const v = form[k];
      if (v !== undefined && v !== null && v !== "") body[k] = typeof v === "string" ? v : String(v);
    }
    // list[str] fields — accept comma-string or array (objects → name/string)
    const arrayFields = ["characters_present", "relationships_used", "factions_used", "threats_used", "world_rules_shown", "power_system_shown"] as const;
    for (const k of arrayFields) {
      const v = form[k];
      let items: string[] = [];
      if (typeof v === "string") {
        items = v.split(",").map((s) => s.trim()).filter(Boolean);
      } else if (Array.isArray(v)) {
        items = v
          .map((x: any) => (typeof x === "string" ? x : x?.name ?? x?.label ?? ""))
          .map((s: any) => String(s).trim())
          .filter(Boolean);
      }
      if (items.length > 0) body[k] = items;
    }
    createChapter.mutate(body, { onSuccess: () => { setChapterForm((f: any) => ({ ...f, chapter_id: "" })); } });
  }

  function resetArcOverview() {
    if (!confirm("Reset all arc overview fields to empty?")) return;
    const empty = { arc_title: "", arc_number: 1, arc_type: "", arc_length_type: "", starting_status_quo: "", main_story_question: "", central_emotional_question: "", main_external_conflict: "", main_internal_conflict: "", main_relationship_conflict: "", main_threat_used: "", ending_type_target: "" };
    setArcForm(empty);
    setArcSummary("");
  }

  function openRedoArcModal() {
    setRedoStructure(structure || content.narrative_structure?.selected || "");
    setRedoCustomStructure(customStructure || content.narrative_structure?.custom_structure || "");
    setRedoConfirmation("");
    setShowRedoModal(true);
  }

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Plot Board" subtitle="Official plot plan only. Free writing belongs in Writing Desk.">
        <div className="space-y-5">
          {/* ---- NARRATIVE STRUCTURE ---- */}
          <div>
            <h3 className="mb-2 font-black">Narrative structure</h3>
            <OptionGrid options={content.narrative_structure?.options || []} selected={structure} onSelect={handleSelectStructure} />
            {structure === "Custom" && <CustomInput label="Custom narrative structure" value={customStructure} onChange={handleCustomStructureChange} placeholder="Describe your custom narrative structure..." />}
            {!structureSelected && (
              <p className="mt-2 text-xs font-bold text-red-600">Please choose narrative structure — required for AI generation.</p>
            )}
            {chapterCount > 0 && (
              <button
                className="mt-3 rounded-xl border-2 border-red-500 bg-white px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm"
                onClick={openRedoArcModal}
              >
                Redo Arc Structure
              </button>
            )}
          </div>

          {/* ---- ARC OVERVIEW ---- */}
          <div>
            <h3 className="mb-2 font-black">Arc overview</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Arc title" value={arcForm.arc_title} onChange={(v) => setArcForm((f) => ({ ...f, arc_title: v }))} />
              <Field label="Arc type" value={arcForm.arc_type} onChange={(v) => setArcForm((f) => ({ ...f, arc_type: v }))} />
              <Field label="Arc number" value={String(arcForm.arc_number)} onChange={(v) => setArcForm((f) => ({ ...f, arc_number: parseInt(v) || 1 }))} />
              <div>
                <label className={`block text-sm font-black ${arcLengthSelected ? "" : "text-red-600"}`}>Arc length</label>
                <select className={`mt-1.5 w-full rounded-xl border-2 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base ${arcLengthSelected ? "border-slate-900" : "border-red-500 bg-red-50"}`} value={arcForm.arc_length_type} onChange={(e) => handleSelectArcLength(e.target.value)}>
                  <option value="">Select...</option>
                  {ARC_LENGTH_OPTS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
                {!arcLengthSelected && <p className="mt-1 text-xs font-bold text-red-600">Please choose arc length.</p>}
              </div>
            </div>
            {!arcLengthSelected && (
              <div className="mt-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-xs font-bold text-red-700">
                {arcLengthRequiredMessage}
              </div>
            )}
            <Field label="Arc summary" value={arcSummary} onChange={setArcSummary} textarea />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Starting status quo" value={arcForm.starting_status_quo} onChange={(v) => setArcForm((f) => ({ ...f, starting_status_quo: v }))} />
              <Field label="Main story question" value={arcForm.main_story_question} onChange={(v) => setArcForm((f) => ({ ...f, main_story_question: v }))} />
              <Field label="Central emotional question" value={arcForm.central_emotional_question} onChange={(v) => setArcForm((f) => ({ ...f, central_emotional_question: v }))} />
              <Field label="Main external conflict" value={arcForm.main_external_conflict} onChange={(v) => setArcForm((f) => ({ ...f, main_external_conflict: v }))} />
              <Field label="Main internal conflict" value={arcForm.main_internal_conflict} onChange={(v) => setArcForm((f) => ({ ...f, main_internal_conflict: v }))} />
              <Field label="Main relationship conflict" value={arcForm.main_relationship_conflict} onChange={(v) => setArcForm((f) => ({ ...f, main_relationship_conflict: v }))} />
              <Field label="Main threat used" value={arcForm.main_threat_used} onChange={(v) => setArcForm((f) => ({ ...f, main_threat_used: v }))} />
              <Field label="Ending type target" value={arcForm.ending_type_target} onChange={(v) => setArcForm((f) => ({ ...f, ending_type_target: v }))} />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm" onClick={saveAllArcFields} disabled={!arcLengthSelected || saveAllArc.isPending || patchArc.isPending}>{saveAllArc.isPending ? "Saving..." : "Save Arc Fields"}</button>
              <button className="rounded-xl border-2 border-red-400 bg-white px-3 py-1.5 text-xs font-black text-red-500 sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm" onClick={resetArcOverview}>Reset Arc</button>
            </div>
          </div>

          {/* ---- STRUCTURE PLAN ---- */}
          {arcLengthSelected && selectedStructure && activeStructureBeats.length > 0 && (
            <div className="rounded-xl border-2 border-slate-900 bg-white p-4 sm:rounded-2xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-black">Structure plan</h3>
                  <p className="mt-1 text-xs font-bold text-slate-600">
                    {String(selectedStructure || "")} · {String(selectedArcLength || "")} · target {arcLengthSpec.label} · ideal {arcLengthSpec.ideal}
                  </p>
                </div>
                {arcChapterCount > 0 && (
                  <span className={`rounded-full border px-2 py-1 text-xs font-black ${atMaxChapterCount ? "border-red-300 bg-red-50 text-red-700" : atIdealChapterCount ? "border-amber-300 bg-amber-50 text-amber-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"}`}>
                    {arcChapterCount}/{arcLengthSpec.ideal} chapters
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {activeStructureBeats.map((beat, i) => {
                  const start = Math.floor((i * arcLengthSpec.ideal) / activeStructureBeats.length) + 1;
                  const end = Math.max(start, Math.floor(((i + 1) * arcLengthSpec.ideal) / activeStructureBeats.length));
                  const covered = meaningfulChapters.some((ch: any) => {
                    const text = [ch.structure_section, ch.chapter_title, ch.chapter_purpose, ch.summary, ch.main_conflict, ch.twist_or_hook, ch.ending_cliffhanger].filter(Boolean).join(" ").toLowerCase();
                    return text.includes(beat.key) || beat.label.toLowerCase().split(" ").some((part) => part.length > 4 && text.includes(part));
                  });
                  return (
                    <div key={beat.key} className={`rounded-lg border p-3 ${covered ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-black">{beat.label}</span>
                        <span className="text-[10px] font-bold text-slate-500">Ch. {start}{end !== start ? `-${end}` : ""}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{beat.purpose}</p>
                      <code className="mt-2 block text-[10px] font-bold text-slate-500">{beat.key}</code>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
            <button className="mt-1 rounded-xl border-2 border-violet-600 bg-violet-600 px-3 py-1.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm" onClick={saveStructureEditors} disabled={!arcLengthSelected || saveAllArc.isPending || patchArc.isPending}>{saveAllArc.isPending ? "Saving..." : "Save Structure Editor"}</button>
          )}

          {/* ---- ACTIONS ---- */}
          <AiFillPanel page="board" fields={[{ key: "arc_overview", label: "Step 1 · Arc Overview", description: "All arc fields (title, conflicts, questions, ending). Generate this first." }, { key: "structure", label: "Step 2 · Structure Plan", description: "Beat order based on the selected narrative structure and arc length. Generate after arc overview." }, { key: "chapters", label: "Step 3 · Chapters", description: "Chapter list with purposes, structure sections, and chapter numbers. Generate after structure." }]} note="Required: pick arc length and narrative structure first. Recommended flow: Step 1 (Arc Overview) → Step 2 (Structure) → Step 3 (Chapters). Each step uses the previous saved data." onFieldSelect={setAiBoardFields} onGenerate={handleAiBoardGenerate} loading={aiGen.isPending} results={aiBoardResults} onClear={() => setAiBoardResults(null)} onApply={handleApplyAi} disabled={!aiPrereqsMet} disabledReason={aiPrereqsMessage} error={aiBoardError} onDismissError={() => setAiBoardError(null)} />
          {saveAllArc.isError && <ErrorBanner error={saveAllArc.error as Error} />}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base" onClick={saveBoard} disabled={!arcLengthSelected || patchStructure.isPending || patchArc.isPending || saveAllArc.isPending}>Save Plot Board</button>
            <AiButton label="AI Plot Assist" onClick={() => { if (!arcSummary.trim()) { alert("Write an arc summary first before using AI Plot Assist."); return; } if (!requireAiPrereqs()) return; aiExpand.mutate(); }} loading={aiExpand.isPending} disabled={!aiPrereqsMet} variant="secondary" />
          </div>

          {aiPlotError && <ErrorBanner error={aiPlotError} onDismiss={() => setAiPlotError(null)} />}
          {aiPlot && (
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4">
              <h3 className="text-sm font-black text-violet-800">✨ AI Plot Suggestion</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{getExpansionText(aiPlot)}</p>
              <button className="mt-2 text-sm font-bold text-violet-600 underline" onClick={() => setAiPlot(null)}>Dismiss</button>
            </div>
          )}

          {/* ---- ARC STATUS BANNER ---- */}
          {arcCompletion.data && (() => {
            const a = arcCompletion.data;
            const struct = a.structural_complete; // true | false | null
            const isComplete = a.is_complete === true;
            const noStructure = struct === null;
            const tone = isComplete
              ? { border: "border-emerald-500", bg: "bg-emerald-50", text: "text-emerald-800", label: "Arc Complete" }
              : noStructure
              ? { border: "border-slate-300", bg: "bg-slate-50", text: "text-slate-700", label: "Arc Status" }
              : struct === false && a.sections_missing.length > 0
              ? { border: "border-amber-400", bg: "bg-amber-50", text: "text-amber-800", label: "Arc In Progress" }
              : { border: "border-slate-300", bg: "bg-slate-50", text: "text-slate-700", label: "Arc In Progress" };
            const arcLabel = a.arc_title ? `"${a.arc_title}"` : "(untitled arc)";
            return (
              <div className={`rounded-xl border-2 ${tone.border} ${tone.bg} p-4 sm:rounded-2xl`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className={`text-[10px] font-black uppercase tracking-wider ${tone.text}`}>{tone.label}</div>
                    <div className="text-base font-black mt-0.5">
                      {arcLabel} — {a.chapter_count} chapter{a.chapter_count === 1 ? "" : "s"}
                      {a.structure_type && a.structure_type !== "Unknown" ? <span className="ml-2 text-xs font-bold text-slate-500">{a.structure_type}</span> : null}
                      {a.llm_used ? <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">LLM</span> : null}
                    </div>
                  </div>
                  {isComplete && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={handleStartNewArc} className="rounded-xl border-2 border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-black text-white sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm">Start New Arc</button>
                      <button onClick={handleExtendArc} className={`rounded-xl border-2 px-3 py-1.5 text-xs font-black sm:rounded-2xl sm:px-4 sm:py-2 sm:text-sm ${extendBypass ? "border-amber-500 bg-amber-500 text-white" : "border-amber-400 bg-white text-amber-700"}`}>
                        {extendBypass ? "Extend armed (next chapter only)" : "Extend Current Arc"}
                      </button>
                    </div>
                  )}
                </div>
                {a.sections_required_labels && a.sections_required_labels.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {a.sections_required.map((key: string, i: number) => {
                      const covered = a.sections_covered?.includes(key);
                      const label = a.sections_required_labels[i] || key;
                      return (
                        <span key={key} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${covered ? "border-emerald-300 bg-emerald-100 text-emerald-800" : "border-slate-300 bg-white text-slate-500"}`}>
                          {covered ? "✓" : "○"} {label}
                        </span>
                      );
                    })}
                  </div>
                )}
                {(a.structural_reason || a.narrative_reason) && (
                  <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                    {a.structural_reason && <div>{a.structural_reason}</div>}
                    {a.narrative_reason && <div className="italic">LLM: {a.narrative_reason}</div>}
                  </div>
                )}
                {Array.isArray(a.missing_beats) && a.missing_beats.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[10px] font-black uppercase text-slate-500">Missing beats</div>
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
                      {a.missing_beats.map((b: string, i: number) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ---- CREATE CHAPTER ---- */}
          <div className="rounded-xl border-2 border-slate-900 bg-white p-4 sm:rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-black">Chapters</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  className={`rounded-xl border-2 px-3 py-1.5 text-sm font-black sm:rounded-2xl sm:px-4 sm:py-2 sm:text-base ${(!aiPrereqsMet || (arcStatusComplete && !extendBypass)) ? "border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed" : "border-violet-400 bg-white text-violet-600"}`}
                  onClick={handleAiNextChapterClick}
                  disabled={!aiPrereqsMet || aiNextChapter.isPending || (arcStatusComplete && !extendBypass)}
                  title={!aiPrereqsMet ? aiPrereqsMessage : arcStatusComplete && !extendBypass ? "Arc is complete — Start New Arc, or click Extend Current Arc above first." : undefined}
                >
                  {aiNextChapter.isPending ? "Generating..." : "+ AI Next Chapter"}
                </button>
                <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50 sm:rounded-2xl sm:px-5 sm:py-2.5 sm:text-base" onClick={() => setShowChapterModal(true)} disabled={!arcLengthSelected} title={!arcLengthSelected ? "Please choose arc length first." : undefined}>+ Create Chapter</button>
              </div>
            </div>
            {!arcLengthSelected && <p className="mt-2 text-xs font-bold text-red-600">Please choose arc length before creating chapters.</p>}
            {arcLengthSelected && !structureSelected && <p className="mt-2 text-xs font-bold text-red-600">Please choose narrative structure before using + AI Next Chapter.</p>}
            {/* Integrity lock restore guide */}
            {integrityLock?.locked && (() => {
              const toRestore: number[] = integrityLock.chapters_to_restore ?? [];
              const restored: number[] = integrityLock.chapters_restored ?? [];
              const allNums = [...restored, ...toRestore];
              const existingNums = new Set<number>((content.chapter_or_episode_list?.chapters ?? []).map((c: any) => c.chapter_number as number));
              const deletedNum = integrityLock.deleted_chapter_number!;
              return (
                <div className="mt-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-amber-700">Story Integrity Lock</span>
                    <span className="text-xs text-amber-600">— restore these chapters in order to unlock</span>
                  </div>
                  <div className="space-y-1.5">
                    {allNums.map((num) => {
                      const isDone = restored.includes(num);
                      const isCurrent = !isDone && toRestore[0] === num;
                      const isPending = !isDone && !isCurrent;
                      const needsCreate = num === deletedNum && !existingNums.has(num);
                      return (
                        <div key={num} className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${isDone ? "border-emerald-300 bg-emerald-50" : isCurrent ? "border-amber-400 bg-white" : "border-slate-200 bg-slate-50 opacity-50"}`}>
                          <span className="flex items-center gap-2">
                            <span className={`text-base ${isDone ? "text-emerald-500" : isCurrent ? "text-amber-500" : "text-slate-400"}`}>{isDone ? "✓" : isCurrent ? "→" : "○"}</span>
                            <span className={`font-bold ${isDone ? "text-emerald-700 line-through" : isCurrent ? "text-slate-900" : "text-slate-500"}`}>Chapter {num}</span>
                            {num === deletedNum && <span className="text-xs text-red-600 font-semibold">(deleted — must recreate)</span>}
                            {num !== deletedNum && !isDone && <span className="text-xs text-slate-500">(exists — review &amp; confirm)</span>}
                          </span>
                          {isCurrent && needsCreate && (
                            <button
                              className="rounded-lg border-2 border-amber-500 bg-amber-500 px-2.5 py-1 text-[11px] font-black text-white hover:bg-amber-600"
                              onClick={() => { setChapterForm((f: any) => ({ ...f, chapter_id: "", chapter_title: "" })); setShowChapterModal(true); }}
                            >
                              Create Ch.{num}
                            </button>
                          )}
                          {isCurrent && !needsCreate && (
                            <button
                              className="rounded-lg border-2 border-amber-500 bg-white px-2.5 py-1 text-[11px] font-black text-amber-700 hover:bg-amber-50"
                              disabled={advanceLockMut.isPending}
                              onClick={() => advanceLockMut.mutate(num)}
                            >
                              {advanceLockMut.isPending ? "…" : "Mark Reviewed ✓"}
                            </button>
                          )}
                          {isPending && <span className="text-[11px] text-slate-400">Waiting</span>}
                        </div>
                      );
                    })}
                  </div>
                  {advanceLockMut.isError && <p className="mt-2 text-xs text-red-600 font-bold">{(advanceLockMut.error as Error).message}</p>}
                </div>
              );
            })()}

            {/* Chapter list grouped by arc */}
            <div className="mt-3 space-y-3 max-h-56 overflow-y-auto">
              {((): any[] => {
                if (!content.chapter_or_episode_list?.chapters?.length) return [<p key="empty" className="text-sm text-slate-500">No chapters created yet.</p>];
                const chapters: any[] = content.chapter_or_episode_list.chapters;
                const arcGroups = new Map<string, any[]>();
                for (const ch of chapters) {
                  const arcName = ch.arc_title || "No Arc";
                  if (!arcGroups.has(arcName)) arcGroups.set(arcName, []);
                  arcGroups.get(arcName)!.push(ch);
                }
                return Array.from(arcGroups.entries()).map(([arcName, chs]) => (
                  <div key={arcName}>
                    <div className="mb-1 flex items-center gap-1 text-xs font-black text-slate-400 uppercase tracking-wide">{arcName} <span className="text-slate-300">({chs.length})</span></div>
                    {chs.map((ch: any) => {
                      const allChapters: any[] = content.chapter_or_episode_list?.chapters ?? [];
                      const maxNum = Math.max(...allChapters.map((c: any) => c.chapter_number ?? 0));
                      const isLast = ch.chapter_number === maxNum;
                      return (
                        <div key={ch.chapter_id} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm mb-1">
                          <span><span className="font-bold">Ch.{ch.chapter_number}</span> {ch.chapter_title || "Untitled"} — <span className="text-slate-500">{ch.structure_section || "No section"}</span></span>
                          <span className="flex gap-1">
                            <button className="text-xs font-bold text-indigo-600 underline" onClick={() => openEditChapter(ch)}>Edit</button>
                            <button
                              className="text-xs font-bold text-red-500 underline"
                              disabled={deleteChapterMut.isPending}
                              onClick={() => setDeleteTarget({ id: ch.chapter_id, title: ch.chapter_title || ch.chapter_id, number: ch.chapter_number, isLast })}
                            >
                              Delete
                            </button>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* ---- RELATIONSHIP MAP UPDATER ---- */}
          <div className="rounded-xl border-2 border-pink-300 bg-pink-50 p-4 sm:rounded-2xl">
            <h3 className="font-black text-sm text-pink-800">Relationship Map</h3>
            <p className="mt-1 text-xs text-pink-600">AI analyzes all chapters and arcs to propose relationship updates between characters.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="rounded-xl border-2 border-pink-400 bg-white px-4 py-2 text-sm font-black text-pink-600" onClick={() => analyzeRels.mutate()} disabled={analyzeRels.isPending}>
                {analyzeRels.isPending ? "Analyzing..." : "Analyze Relationships"}
              </button>
              {relProposals !== null && relProposals.length === 0 && !analyzeRels.isPending && (
                <span className="text-sm font-bold text-slate-500 self-center">No new relationships detected.</span>
              )}
              {relProposals && relProposals.length > 0 && (
                <button className="rounded-xl border-2 border-pink-600 bg-pink-600 px-4 py-2 text-sm font-black text-white" onClick={() => applyRels.mutate(relProposals)} disabled={applyRels.isPending}>
                  {applyRels.isPending ? "Applying..." : `Apply ${relProposals.length} Updates`}
                </button>
              )}
            </div>
            {relProposals && relProposals.length > 0 && (
              <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
                {relProposals.map((r: any, i: number) => (
                  <div key={i} className="rounded-lg border border-pink-200 bg-white p-2 text-xs">
                    <span className="font-bold">{r.characters_involved || "?"}</span>
                    <span className="ml-2 rounded bg-pink-100 px-1.5 py-0.5 font-bold text-pink-700">{r.relationship_change_type || "neutral"}</span>
                    {r.reason && <span className="ml-2 text-slate-500">{r.reason}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- CHAPTER MODAL ---- */}
          {showChapterModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowChapterModal(false)}>
              <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border-2 border-slate-900 bg-white p-5 sm:p-6" onClick={(e) => e.stopPropagation()}>
                <h3 className="font-black text-lg">{chapterForm.chapter_id ? `Edit Chapter: ${chapterForm.chapter_id}` : "Create Chapter"}</h3>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-black">Arc</label>
                    <select className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" value={chapterForm.arc_title} onChange={(e) => setChapterForm((f) => ({ ...f, arc_title: e.target.value }))}>
                      <option value="">— No Arc —</option>
                      {arcForm?.arc_title && <option value={arcForm.arc_title}>{arcForm.arc_title}</option>}
                    </select>
                  </div>
                  <Field label="Chapter title" value={chapterForm.chapter_title} onChange={(v) => setChapterForm((f) => ({ ...f, chapter_title: v }))} />
                  {activeStructureBeats.length > 0 ? (
                    <div>
                      <label className="block text-sm font-black">Structure section</label>
                      <select className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base" value={chapterForm.structure_section} onChange={(e) => setChapterForm((f) => ({ ...f, structure_section: e.target.value }))}>
                        <option value="">Select beat...</option>
                        {activeStructureBeats.map((beat) => <option key={beat.key} value={beat.key}>{beat.label}</option>)}
                      </select>
                    </div>
                  ) : (
                    <Field label="Structure section" value={chapterForm.structure_section} onChange={(v) => setChapterForm((f) => ({ ...f, structure_section: v }))} />
                  )}
                  <div className="sm:col-span-2"><Field label="Chapter purpose" value={chapterForm.chapter_purpose} onChange={(v) => setChapterForm((f) => ({ ...f, chapter_purpose: v }))} /></div>
                  <div className="sm:col-span-2"><Field label="Summary" value={chapterForm.summary} onChange={(v) => setChapterForm((f) => ({ ...f, summary: v }))} textarea /></div>
                  <Field label="Main conflict" value={chapterForm.main_conflict} onChange={(v) => setChapterForm((f) => ({ ...f, main_conflict: v }))} />
                  <Field label="Emotional beat" value={chapterForm.emotional_beat} onChange={(v) => setChapterForm((f) => ({ ...f, emotional_beat: v }))} />
                  <Field label="Twist or hook" value={chapterForm.twist_or_hook} onChange={(v) => setChapterForm((f) => ({ ...f, twist_or_hook: v }))} />
                  <Field label="Ending cliffhanger" value={chapterForm.ending_cliffhanger} onChange={(v) => setChapterForm((f) => ({ ...f, ending_cliffhanger: v }))} />
                  {/* Cross-page reference dropdowns */}
                  <div>
                    <label className="block text-sm font-black">Characters present</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={chapterForm.characters_present.split(",").map((s) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setChapterForm((f) => ({ ...f, characters_present: vals.join(", ") })); }}>
                      {(refData.characters || []).map((c: any) => <option key={c.id || c} value={c.name || c}>{c.name || c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black">Factions used</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={chapterForm.factions_used.split(",").map((s) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setChapterForm((f) => ({ ...f, factions_used: vals.join(", ") })); }}>
                      {(refData.factions || []).map((f: string) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black">Threats used</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={chapterForm.threats_used.split(",").map((s) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setChapterForm((f) => ({ ...f, threats_used: vals.join(", ") })); }}>
                      {(refData.threats || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-black">Relationships used</label>
                    <select multiple className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base min-h-[80px]" value={chapterForm.relationships_used.split(",").map((s) => s.trim()).filter(Boolean)} onChange={(e) => { const vals = Array.from(e.target.selectedOptions, (o) => o.value); setChapterForm((f) => ({ ...f, relationships_used: vals.join(", ") })); }}>
                      {(refData.relationships || [])
                        .filter((r: any) => r.from && r.to)
                        .map((r: any) => <option key={r.id} value={r.id}>{r.from} ↔ {r.to}{r.type ? ` (${r.type})` : ""}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50" onClick={submitChapter} disabled={!arcLengthSelected || !chapterForm.chapter_title || createChapter.isPending}>{chapterForm.chapter_id ? "Update Chapter" : "Create Chapter"}</button>
                  <button className="rounded-xl border-2 border-slate-400 bg-white px-5 py-3 text-sm font-black text-slate-600" onClick={() => setShowChapterModal(false)}>Cancel</button>
                  {createChapter.isError && <ErrorBanner error={createChapter.error as Error} />}
                </div>
              </div>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="plot_outline.json"><StructuredJsonView data={content} /></Panel>

      {/* Redo arc structure confirmation dialog */}
      {showRedoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRedoModal(false)}>
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
                {(content.narrative_structure?.options || []).map((option: string) => <option key={option} value={option}>{option}</option>)}
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
                onClick={() => redoArcMut.mutate()}
                disabled={!redoStructure || redoConfirmation !== "RESET ARC" || redoArcMut.isPending}
              >
                {redoArcMut.isPending ? "Resetting..." : "Reset Chapters and Script"}
              </button>
              <button
                className="rounded-xl border-2 border-slate-900 bg-white px-4 py-2.5 text-sm font-black hover:bg-slate-50"
                onClick={() => setShowRedoModal(false)}
                disabled={redoArcMut.isPending}
              >
                Cancel
              </button>
            </div>
            {redoArcMut.isError && <p className="mt-3 text-xs font-bold text-red-600">{(redoArcMut.error as Error).message}</p>}
          </div>
        </div>
      )}

      {/* ── Delete confirmation dialog ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border-2 border-slate-900 bg-white p-6 shadow-[6px_6px_0_#111827]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 text-2xl">⚠️</span>
              <div>
                <h3 className="font-black text-lg text-slate-900">Delete Chapter {deleteTarget.number}?</h3>
                <p className="mt-1 text-sm font-semibold text-slate-600">&ldquo;{deleteTarget.title}&rdquo;</p>
              </div>
            </div>

            {deleteTarget.isLast ? (
              <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                <span className="font-black">Last chapter</span> — no chapters follow this one, so the story will stay unlocked.
                Any scenes attached to this chapter will also be removed.
              </div>
            ) : (
              <div className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-black">⚠ This will lock the story.</p>
                <p className="mt-1">Chapters that come after this one depend on it for continuity. You will need to:</p>
                <ol className="mt-2 ml-4 list-decimal space-y-0.5 text-xs font-semibold">
                  <li>Recreate Chapter {deleteTarget.number}</li>
                  <li>Review and confirm each later chapter in order</li>
                  <li>All writing and scripting is disabled until the lock is cleared</li>
                </ol>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                className="flex-1 rounded-xl border-2 border-red-500 bg-red-500 px-4 py-2.5 text-sm font-black text-white hover:bg-red-600"
                onClick={() => deleteChapterMut.mutate(deleteTarget.id)}
                disabled={deleteChapterMut.isPending}
              >
                {deleteChapterMut.isPending ? "Deleting…" : "Yes, Delete"}
              </button>
              <button
                className="flex-1 rounded-xl border-2 border-slate-900 bg-white px-4 py-2.5 text-sm font-black hover:bg-slate-50"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
            </div>
            {deleteChapterMut.isError && <p className="mt-3 text-xs font-bold text-red-600">{(deleteChapterMut.error as Error).message}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
