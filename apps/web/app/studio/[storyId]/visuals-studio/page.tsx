"use client";

import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { AiButton } from "@/components/forms/AiButton";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

const RENDER_MODES = ["t2i", "i2i", "layered"] as const;
type RenderMode = typeof RENDER_MODES[number];

const RENDER_MODE_LABELS: Record<RenderMode, string> = {
  t2i: "Text-to-image (default)",
  i2i: "Image-to-image (continuity)",
  layered: "Layered (char ref + location ref)",
};

const ALL_PANEL_FIELDS = [
  "render_mode",
  "visual",
  "character_action",
  "background_details",
  "facial_expression",
  "pose_or_body_language",
  "mood",
  "narration",
  "location_id",
  "lighting",
  "characters_in_panel",
];

type Panel_ = {
  panel_id: string;
  panel_number: number;
  location_id: string;
  render_mode: { selected: RenderMode; options: string[] } | string;
  visual: string;
  character_action: string;
  background_details: string;
  facial_expression: string;
  pose_or_body_language: string;
  mood: string;
  narration: string;
  lighting?: string;
  characters_in_panel?: string[];
};

type Page_ = {
  page_id: string;
  page_number: number;
  scene_id: string;
  page_mood: string;
  page_purpose: string;
  panels: Panel_[];
};

function getRenderMode(panel: Panel_): RenderMode {
  if (typeof panel.render_mode === "object" && panel.render_mode !== null) {
    return (panel.render_mode.selected as RenderMode) || "t2i";
  }
  return (panel.render_mode as RenderMode) || "t2i";
}

// Coerce any value to a plain string — handles selection objects { selected, options, ... }
// that the LLM sometimes returns for text fields.
function panelText(val: any): string {
  if (val == null || val === "") return "";
  if (typeof val === "string") return val;
  if (typeof val === "object") {
    if ("selected" in val) {
      return Array.isArray(val.selected) ? val.selected.join(", ") : String(val.selected ?? "");
    }
    return JSON.stringify(val);
  }
  return String(val);
}

// Strip selection objects from text panel fields so they render as plain strings.
function normalizePanel(pn: any): any {
  const TEXT_FIELDS = ["visual", "character_action", "background_details", "facial_expression",
    "pose_or_body_language", "mood", "narration", "lighting"];
  const out = { ...pn };
  for (const f of TEXT_FIELDS) {
    if (out[f] !== undefined) out[f] = panelText(out[f]);
  }
  // characters_in_panel is array-typed — coerce to string[] (handle missing or scalar)
  if (out.characters_in_panel === undefined || out.characters_in_panel === null) {
    out.characters_in_panel = [];
  } else if (!Array.isArray(out.characters_in_panel)) {
    out.characters_in_panel = [String(out.characters_in_panel)];
  }
  return out;
}

export default function VisualsStudioPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const qc = useQueryClient();

  const [selectedChapterId, setSelectedChapterId] = useState("");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number; chapterDone?: number; chapterTotal?: number } | null>(null);

  const chaptersStatus = useQuery({
    queryKey: ["chaptersStatus", storyId],
    queryFn: () => api.getChapterScriptStatuses(storyId),
  });

  const scriptQuery = useQuery({
    queryKey: ["script", storyId, selectedChapterId],
    queryFn: () => api.getChapterScript(storyId, selectedChapterId),
  });

  const locsQuery = useQuery({
    queryKey: ["locations", storyId],
    queryFn: () => api.listLocations(storyId),
  });

  // Characters list — used by the per-panel Characters multi-select (audit fix #6)
  const charactersQuery = useQuery({
    queryKey: ["characters", storyId],
    queryFn: () => api.getCharacters(storyId),
  });

  // Load a chapter into the working slot before any fill/patch/approve operation.
  // Returns false (and sets aiError) if the current unapproved chapter blocks the load.
  // We check scriptQuery.data.source — only skip the API call if the backend already
  // told us the viewed data IS the working slot (source === "current").  Checking
  // currentChapterId alone is wrong because version-history data also carries the
  // chapter's own chapter_id, so the IDs would match even when the working slot holds
  // a different chapter.
  async function ensureChapterLoaded(chapterId: string): Promise<boolean> {
    const isWorkingSlot =
      (scriptQuery.data as any)?.source === "current" && currentChapterId === chapterId;
    if (isWorkingSlot) return true;
    try {
      await api.loadChapterScript(storyId, chapterId);
      await scriptQuery.refetch();
      await chaptersStatus.refetch();
      return true;
    } catch (e: any) {
      setAiError(e.message || `Could not load chapter ${chapterId}`);
      return false;
    }
  }

  const scriptData = useMemo(() => (scriptQuery.data?.content || scriptQuery.data || {}) as any, [scriptQuery.data]);
  const pages: Page_[] = useMemo(() => {
    const raw: any[] = scriptData?.pages || [];
    return raw.map((pg: any) => ({ ...pg, panels: (pg.panels || []).map(normalizePanel) }));
  }, [scriptData]);
  const locations: any[] = useMemo(() => (locsQuery.data as any[]) || [], [locsQuery.data]);

  // Combined major + side character list for the per-panel Characters multi-select.
  // Stored as {id, name} so the UI can show names while persisting profile_id slugs.
  const allCharacters: { id: string; name: string }[] = useMemo(() => {
    const ch: any = charactersQuery.data || {};
    const major = ch?.content?.created_major_character_profiles
      || ch?.created_major_character_profiles || [];
    const side = ch?.content?.created_side_character_profiles
      || ch?.created_side_character_profiles || [];
    const rows = [...major, ...side]
      .filter((p: any) => p && (p.profile_id || p.character_name))
      .map((p: any) => ({ id: p.profile_id || p.character_name, name: p.character_name || p.profile_id }));
    return rows;
  }, [charactersQuery.data]);
  const chapterTitle: string = scriptData?.chapter_metadata?.chapter_title || "";
  const chapterNum: string | number = scriptData?.chapter_metadata?.chapter_number || "";
  const currentChapterId: string = scriptData?.chapter_metadata?.chapter_id || "";

  const allChapters: any[] = useMemo(() => chaptersStatus.data?.chapters || [], [chaptersStatus.data]);

  const [localPages, setLocalPages] = useState<Page_[] | null>(null);
  const workingPages = localPages ?? pages;

  // Reset local edits when the loaded chapter changes
  useEffect(() => { setLocalPages(null); }, [scriptQuery.data]);

  // Auto-select the first chapter that has a script on initial load
  useEffect(() => {
    if (selectedChapterId || allChapters.length === 0) return;
    const first = allChapters.find((ch: any) => ch.has_script);
    if (first) setSelectedChapterId(first.chapter_id);
  }, [allChapters, selectedChapterId]);

  function updatePanel(pageIdx: number, panelIdx: number, key: string, value: string | string[]) {
    const base = localPages ?? pages;
    const updated = base.map((pg, pi) => {
      if (pi !== pageIdx) return pg;
      return {
        ...pg,
        panels: pg.panels.map((pn, ni) => {
          if (ni !== panelIdx) return pn;
          if (key === "render_mode") {
            return { ...pn, render_mode: { selected: value as RenderMode, options: RENDER_MODES as unknown as string[] } };
          }
          return { ...pn, [key]: value };
        }),
      };
    });
    setLocalPages(updated);
  }

  // Toggle a character in/out of the panel's characters_in_panel list.
  function togglePanelCharacter(pageIdx: number, panelIdx: number, charId: string) {
    const base = localPages ?? pages;
    const panel = base[pageIdx]?.panels[panelIdx];
    if (!panel) return;
    const current = Array.isArray(panel.characters_in_panel) ? panel.characters_in_panel : [];
    const next = current.includes(charId)
      ? current.filter((c) => c !== charId)
      : [...current, charId];
    updatePanel(pageIdx, panelIdx, "characters_in_panel", next);
  }

  function applyToPanel(pages_: Page_[], pageIdx: number, panelIdx: number, fields: Record<string, string>): Page_[] {
    return pages_.map((pg, pi) =>
      pi !== pageIdx ? pg : {
        ...pg,
        panels: pg.panels.map((pn, ni) => ni !== panelIdx ? pn : { ...pn, ...fields }),
      }
    );
  }

  async function saveChanges(pagesToSave?: Page_[]) {
    const toSave = pagesToSave ?? localPages;
    if (!toSave) return;
    setSaving(true);
    try {
      const viewingId = selectedChapterId || currentChapterId;
      if (viewingId) {
        const ok = await ensureChapterLoaded(viewingId);
        if (!ok) return;
      }
      await api.patchChapterScript(storyId, { target_branch: "pages", operation: "replace", value: toSave });
      qc.invalidateQueries({ queryKey: ["script", storyId] });
      setLocalPages(null);
    } finally {
      setSaving(false);
    }
  }

  // Returns updated pages array; caller decides whether to set state.
  // chapterCtx overrides the current chapter's num/title (used by Generate All Chapters).
  async function fillOnePanel(
    pageIdx: number,
    panelIdx: number,
    fields: string[],
    currentPages: Page_[],
    chapterCtx?: { chapter_number: any; chapter_title: string },
  ): Promise<Page_[]> {
    const panel = currentPages[pageIdx]?.panels[panelIdx];
    if (!panel) return currentPages;

    const ctxNum = chapterCtx?.chapter_number ?? chapterNum;
    const ctxTitle = chapterCtx?.chapter_title ?? chapterTitle;

    const res = await api.aiFillField(storyId, {
      page: "script",
      target_fields: fields,
      partial_input: {
        ...panel,
        location_name: locations.find((l) => l.location_id === panel.location_id)?.name || "",
      },
      generation_hints: {
        chapter_number: ctxNum,
        chapter_title: ctxTitle,
        page_number: currentPages[pageIdx]?.page_number,
        panel_number: panel.panel_number,
        // Pass known location IDs so the LLM can pick a valid one for location_id
        available_locations: locations.map((l: any) => ({
          location_id: l.location_id,
          name: l.name,
          type: l.type || "",
        })),
      },
    });

    const generated = res?.generated_fields || res?.generated || {};
    const relevant: Record<string, any> = {};
    for (const f of fields) {
      const val = generated[f];
      if (val === undefined || val === null || val === "") continue;
      if (f === "location_id") {
        const valStr = String(val).trim();
        // Match by ID first, then fall back to name match (LLM sometimes returns the name).
        const byId = locations.find((l: any) => l.location_id === valStr);
        if (byId) {
          relevant[f] = valStr;
        } else {
          const byName = locations.find(
            (l: any) => (l.name || "").toLowerCase() === valStr.toLowerCase()
          );
          if (byName) relevant[f] = byName.location_id;
        }
      } else if (f === "render_mode") {
        // AI returns a string like "i2i"; wrap it in the object shape the panel expects.
        const mode = (typeof val === "string" ? val : val?.selected || "").trim().toLowerCase() as RenderMode;
        if (RENDER_MODES.includes(mode)) {
          relevant[f] = { selected: mode, options: [...RENDER_MODES] };
        }
      } else {
        // LLM sometimes wraps text fields in a selection object { selected, options, ... }.
        // Flatten those to a plain string so they can be rendered as React children.
        let v: any = val;
        if (typeof v === "object" && v !== null) {
          if ("selected" in v) {
            v = Array.isArray(v.selected) ? v.selected.join(", ") : String(v.selected ?? "");
          } else {
            v = JSON.stringify(v);
          }
        }
        const str = String(v ?? "").trim();
        if (str) relevant[f] = str;
      }
    }

    return Object.keys(relevant).length ? applyToPanel(currentPages, pageIdx, panelIdx, relevant) : currentPages;
  }

  // Batch-fill every panel in the current chapter with one LLM call.
  // The working slot must already hold the target chapter before calling this.
  // Returns the updated pages array with filled panels applied.
  async function fillChapterBatch(currentPages: Page_[]): Promise<Page_[]> {
    const res = await api.fillChapterVisuals(storyId, {
      available_locations: locations.map((l: any) => ({
        location_id: l.location_id,
        name: l.name,
        type: l.type || "",
      })),
    });

    const panelsMap: Record<string, any> = res?.panels || {};
    if (!Object.keys(panelsMap).length) return currentPages;

    return currentPages.map((pg) => ({
      ...pg,
      panels: pg.panels.map((pn) => {
        const filled = panelsMap[pn.panel_id];
        if (!filled) return pn;
        const merged: any = { ...pn };
        const TEXT_FIELDS = ["visual", "character_action", "background_details",
          "facial_expression", "pose_or_body_language", "mood", "narration"];
        for (const f of TEXT_FIELDS) {
          if (filled[f] == null) continue;
          let v: any = filled[f];
          if (typeof v === "object" && v !== null) {
            v = "selected" in v
              ? (Array.isArray(v.selected) ? v.selected.join(", ") : String(v.selected ?? ""))
              : JSON.stringify(v);
          }
          const s = String(v ?? "").trim();
          if (s) merged[f] = s;
        }
        if (filled.location_id) {
          const valStr = String(filled.location_id).trim();
          const byId = locations.find((l: any) => l.location_id === valStr);
          if (byId) merged.location_id = valStr;
          else {
            const byName = locations.find((l: any) =>
              (l.name || "").toLowerCase() === valStr.toLowerCase()
            );
            if (byName) merged.location_id = byName.location_id;
          }
        }
        if (filled.render_mode) {
          const mode = (typeof filled.render_mode === "string"
            ? filled.render_mode
            : (filled.render_mode?.selected || "")).trim().toLowerCase() as RenderMode;
          if (RENDER_MODES.includes(mode))
            merged.render_mode = { selected: mode, options: [...RENDER_MODES] };
        }
        return normalizePanel(merged);
      }),
    }));
  }

  // Single-panel fill (Fill Panel button)
  async function handleFillPanel(pageIdx: number, panelIdx: number) {
    const key = `${pageIdx}-${panelIdx}`;
    setAiLoading(key);
    setAiError(null);
    try {
      const viewingId = selectedChapterId || currentChapterId;
      if (viewingId) {
        const ok = await ensureChapterLoaded(viewingId);
        if (!ok) { setAiLoading(null); return; }
      }
      const updated = await fillOnePanel(pageIdx, panelIdx, ALL_PANEL_FIELDS, localPages ?? pages);
      setLocalPages(updated);
    } catch (e: any) {
      setAiError(e.message || "AI fill failed");
    } finally {
      setAiLoading(null);
    }
  }

  // Per-page fill (Fill Page button)
  async function handleFillPage(pageIdx: number) {
    setAiLoading(`page-${pageIdx}`);
    setAiError(null);
    let current = localPages ?? pages;
    try {
      const viewingId = selectedChapterId || currentChapterId;
      if (viewingId) {
        const ok = await ensureChapterLoaded(viewingId);
        if (!ok) { setAiLoading(null); return; }
      }
      for (let ni = 0; ni < current[pageIdx].panels.length; ni++) {
        current = await fillOnePanel(pageIdx, ni, ALL_PANEL_FIELDS, current);
      }
      setLocalPages(current);
    } catch (e: any) {
      setAiError(e.message || "Page fill failed");
      setLocalPages(current);
    } finally {
      setAiLoading(null);
    }
  }

  // Generate All — fills every panel of the current chapter in ONE batch LLM call
  async function handleGenerateAll() {
    setAiError(null);
    const viewingId = selectedChapterId || currentChapterId;
    if (viewingId) {
      const ok = await ensureChapterLoaded(viewingId);
      if (!ok) return;
    }
    setAiLoading("all");
    setGenProgress({ done: 0, total: 1 });
    try {
      const filled = await fillChapterBatch(workingPages);
      setLocalPages(filled);
      setGenProgress({ done: 1, total: 1 });
      await saveChanges(filled);
    } catch (e: any) {
      setAiError(e.message || "Generate all failed");
    } finally {
      setAiLoading(null);
      setGenProgress(null);
    }
  }

  // Fill every panel across ALL chapters sequentially on the server, one chapter at a time.
  // Each LLM call receives only that chapter's data, keeping prompts small and fast.
  async function handleGenerateAllChapters() {
    setAiError(null);
    const chaptersWithScript = allChapters.filter((ch: any) => ch.has_script);
    if (chaptersWithScript.length === 0) {
      setAiError("No chapters with scripts found. Generate scripts in Manga Script first.");
      return;
    }
    if (!window.confirm(
      `Fill visuals for ALL ${chaptersWithScript.length} chapters?\n\nEach chapter is processed one at a time on the server.\nThis will overwrite existing panel fields and approve each chapter.`
    )) return;

    setAiLoading("all-chapters");
    setGenProgress({ done: 0, total: chaptersWithScript.length });
    try {
      const result = await api.fillVisualsAllBatch(storyId, {
        chapter_ids: chaptersWithScript.map((ch: any) => ch.chapter_id),
        available_locations: locations.map((l: any) => ({ location_id: l.location_id, name: l.name, type: l.type || "" })),
      });
      const done = result.chapters_processed || 0;
      const failed = result.chapters_failed || 0;
      setGenProgress({ done, total: chaptersWithScript.length });
      if (failed > 0) {
        setAiError(`${done} chapters filled, ${failed} failed — check browser console.`);
      }
    } catch (e: any) {
      setAiError(e.message || "Generate all chapters failed");
    } finally {
      setAiLoading(null);
      setGenProgress(null);
      chaptersStatus.refetch();
      scriptQuery.refetch();
    }
  }

  // Clicking a chapter only changes the view — scriptQuery reads from version history
  // without touching the working slot, so no MUST_APPROVE gate fires.
  // Fill ops call ensureChapterLoaded() explicitly before patching.
  function handleChapterSelect(chapterId: string) {
    if (chapterId === (selectedChapterId || currentChapterId)) return;
    setSelectedChapterId(chapterId);
    setLocalPages(null);
  }

  const isLoading = scriptQuery.isLoading || chaptersStatus.isLoading;
  if (isLoading) return <div className="text-zinc-500 text-sm">Loading…</div>;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Visuals Studio</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {chapterNum
              ? `Chapter ${chapterNum}${chapterTitle ? `: ${chapterTitle}` : ""}`
              : "Select a chapter below"}{" "}
            — render mode + location per panel.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {genProgress && (
            <span className="text-xs text-zinc-400 animate-pulse">
              {aiLoading === "all-chapters"
                ? `Filling all ${genProgress.total} chapters (one at a time)…`
                : "Filling chapter…"}
            </span>
          )}
          <AiButton
            label={aiLoading === "all" ? "Filling chapter…" : "✦ Generate All Panels"}
            className="!px-3 !py-1.5 !text-xs !rounded-lg"
            onClick={handleGenerateAll}
            loading={aiLoading === "all"}
            disabled={aiLoading !== null || !pages.length}
          />
          <AiButton
            label={
              aiLoading === "all-chapters"
                ? `Ch ${(genProgress?.chapterDone ?? 0) + 1}/${genProgress?.chapterTotal ?? "?"}…`
                : "✦ Generate All Chapters"
            }
            className="!px-3 !py-1.5 !text-xs !rounded-lg !bg-violet-700 hover:!bg-violet-600"
            onClick={handleGenerateAllChapters}
            loading={aiLoading === "all-chapters"}
            disabled={aiLoading !== null || allChapters.filter((c: any) => c.has_script).length === 0}
          />
          {localPages && (
            <button
              onClick={() => saveChanges()}
              disabled={saving}
              className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          )}
        </div>
      </div>

      {/* ── Chapter picker ── */}
      <div className="bg-zinc-900 border border-zinc-700 rounded p-3 space-y-2">
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Chapter</span>
        {allChapters.length === 0 ? (
          <p className="text-xs text-zinc-500">
            No chapters found. Create chapters in the Plot Board and generate scripts in Manga Script first.
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {allChapters.map((ch: any) => {
              const activeId = selectedChapterId || currentChapterId;
              const isSelected = activeId === ch.chapter_id;
              const hasScript = ch.has_script;
              const isApproved = ch.approved;
              return (
                <button
                  key={ch.chapter_id}
                  onClick={() => handleChapterSelect(ch.chapter_id)}
                  disabled={!hasScript}
                  title={
                    !hasScript
                      ? "No script generated yet — go to Manga Script first"
                      : isApproved
                        ? "Approved"
                        : "Generated — not yet approved"
                  }
                  className={[
                    "px-2.5 py-1 text-xs rounded border transition-colors",
                    isSelected
                      ? "bg-indigo-700 border-indigo-500 text-white"
                      : hasScript
                        ? "bg-zinc-800 border-zinc-600 text-zinc-200 hover:border-indigo-400 cursor-pointer"
                        : "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed",
                  ].join(" ")}
                >
                  Ch {ch.chapter_number}
                  {ch.chapter_title ? ` — ${ch.chapter_title}` : ""}
                  <span className="ml-1 opacity-60">
                    {hasScript ? (isApproved ? "✓" : "•") : "○"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {scriptQuery.isFetching && selectedChapterId && (
          <p className="text-xs text-zinc-500">Loading chapter script…</p>
        )}
        <p className="text-xs text-zinc-700">✓ approved  •  generated  ○  no script</p>
      </div>

      <ErrorBanner error={aiError} onDismiss={() => setAiError(null)} />

      {/* ── No pages fallback ── */}
      {!pages.length && (
        <div className="text-zinc-400 text-sm bg-zinc-900 border border-zinc-700 rounded p-4">
          No script pages for this chapter. Generate a chapter script first in{" "}
          <span className="text-blue-400">Manga Script</span>.
        </div>
      )}

      {/* ── Pages ── */}
      {workingPages.map((page, pageIdx) => (
        <Panel key={page.page_id} title={`Page ${page.page_number}`}>

          {/* Page header row */}
          <div className="flex items-center justify-between mb-3 gap-2">
            {page.page_mood
              ? <p className="text-xs text-zinc-500">Mood: {page.page_mood}</p>
              : <span />
            }
            <AiButton
              label={aiLoading === `page-${pageIdx}` ? "Filling page…" : "✦ Fill Page"}
              className="!px-2 !py-1 !text-xs !rounded-lg"
              onClick={() => handleFillPage(pageIdx)}
              loading={aiLoading === `page-${pageIdx}`}
              disabled={aiLoading !== null}
            />
          </div>

          {/* Panels */}
          <div className="space-y-4">
            {page.panels.map((panel, panelIdx) => {
              const rm = getRenderMode(panel);
              const fillKey = `${pageIdx}-${panelIdx}`;
              const filling = aiLoading === fillKey;
              const locName = locations.find((l: any) => l.location_id === panel.location_id)?.name || "";

              return (
                <div key={panel.panel_id} className="border border-zinc-700 rounded p-3 space-y-3">

                  {/* Controls row */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-zinc-300">Panel {panel.panel_number}</span>

                    {/* Render mode */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-500">Render:</span>
                      <select
                        className="text-xs bg-zinc-800 text-white border border-zinc-700 rounded px-2 py-1"
                        value={rm}
                        onChange={(e) => updatePanel(pageIdx, panelIdx, "render_mode", e.target.value)}
                      >
                        {RENDER_MODES.map((m) => (
                          <option key={m} value={m}>{RENDER_MODE_LABELS[m]}</option>
                        ))}
                      </select>
                    </div>

                    {/* Location picker */}
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-zinc-500">Location:</span>
                      <select
                        className={[
                          "text-xs bg-zinc-800 border rounded px-2 py-1",
                          panel.location_id ? "text-white border-zinc-700" : "text-zinc-500 border-zinc-700",
                        ].join(" ")}
                        value={panel.location_id || ""}
                        onChange={(e) => updatePanel(pageIdx, panelIdx, "location_id", e.target.value)}
                      >
                        <option value="">— none —</option>
                        {locations.map((loc: any) => (
                          <option key={loc.location_id} value={loc.location_id}>{loc.name}</option>
                        ))}
                      </select>
                    </div>

                    <AiButton
                      label={filling ? "Filling…" : "⚡ Fill Panel"}
                      className="!px-2 !py-1 !text-xs !rounded-lg ml-auto"
                      onClick={() => handleFillPanel(pageIdx, panelIdx)}
                      loading={filling}
                      disabled={aiLoading !== null}
                    />
                  </div>

                  {/* Characters in panel (multi-select chips) — audit fix #6 */}
                  {allCharacters.length > 0 && (
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Characters in this panel:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {allCharacters.map((c) => {
                          const selected = (panel.characters_in_panel || []).includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => togglePanelCharacter(pageIdx, panelIdx, c.id)}
                              className={[
                                "text-xs rounded-full border px-2 py-0.5 transition-colors",
                                selected
                                  ? "bg-indigo-600 border-indigo-400 text-white"
                                  : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-indigo-500 hover:text-zinc-200",
                              ].join(" ")}
                              title={c.id}
                            >
                              {c.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Lighting (free text) — audit fix #7 */}
                  <div>
                    <label className="text-xs text-zinc-500 block mb-1">Lighting:</label>
                    <input
                      type="text"
                      value={panel.lighting || ""}
                      onChange={(e) => updatePanel(pageIdx, panelIdx, "lighting", e.target.value)}
                      placeholder="e.g. single cold light from cracked window, deep shadow fill"
                      className="w-full text-xs bg-zinc-800 text-white border border-zinc-700 rounded px-2 py-1 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Prompt preview */}
                  <div className="text-xs text-zinc-400 space-y-1">
                    {panelText(panel.visual) && <div><span className="text-zinc-600">Visual:</span> {panelText(panel.visual)}</div>}
                    {panelText(panel.character_action) && <div><span className="text-zinc-600">Action:</span> {panelText(panel.character_action)}</div>}
                    {panelText(panel.background_details) && <div><span className="text-zinc-600">Background:</span> {panelText(panel.background_details)}</div>}
                    {panelText(panel.facial_expression) && <div><span className="text-zinc-600">Expression:</span> {panelText(panel.facial_expression)}</div>}
                    {panelText(panel.pose_or_body_language) && <div><span className="text-zinc-600">Pose:</span> {panelText(panel.pose_or_body_language)}</div>}
                    {panelText(panel.mood) && <div><span className="text-zinc-600">Mood:</span> {panelText(panel.mood)}</div>}
                    {panelText(panel.lighting) && <div><span className="text-zinc-600">Lighting:</span> {panelText(panel.lighting)}</div>}
                    {panelText(panel.narration) && <div><span className="text-zinc-600">Narration:</span> {panelText(panel.narration)}</div>}
                    {locName && (
                      <div className="mt-1 text-indigo-400">📍 {locName}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      ))}
    </div>
  );
}
