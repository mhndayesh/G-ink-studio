// Auto-Pilot orchestrator.
//
// Drives the entire 14-phase studio workflow from a single idea to a downloaded
// triple-zip export, using only the existing api.ts wrappers — no backend changes.

import { api, exportApi, triggerBlobDownload } from "./api";
import { unwrapGeneratedFields } from "./aiResults";

export type PhaseStatus = "pending" | "running" | "done" | "error" | "skipped";

export type PhaseKey =
  | "seed"
  | "world"
  | "cast_structure"
  | "cast_profiles"
  | "side"
  | "relationships"
  | "faction_visuals"
  | "board"
  | "scenes"
  | "threads"
  | "locations"
  | "script"
  | "visuals"
  | "export";

export interface PhaseReport {
  key: PhaseKey;
  label: string;
  status: PhaseStatus;
  warnings: string[];
  detail: string;
  error?: string;
  startedAt?: string;
  endedAt?: string;
}

export const PHASES: { key: PhaseKey; label: string; targetPage?: string }[] = [
  { key: "seed", label: "Story Seed", targetPage: "seed" },
  { key: "world", label: "World Core", targetPage: "world" },
  { key: "cast_structure", label: "Cast Structure", targetPage: "cast" },
  { key: "cast_profiles", label: "Major Characters", targetPage: "cast" },
  { key: "side", label: "Side Characters", targetPage: "side" },
  { key: "relationships", label: "Relationship Web", targetPage: "web" },
  { key: "faction_visuals", label: "Faction Visuals", targetPage: "faction-visuals" },
  { key: "board", label: "Plot Board", targetPage: "board" },
  { key: "scenes", label: "Scene Cards", targetPage: "scenes" },
  { key: "threads", label: "Plot Threads", targetPage: "threads" },
  { key: "locations", label: "Locations", targetPage: "locations" },
  { key: "script", label: "Manga Script (per chapter)", targetPage: "script" },
  { key: "visuals", label: "Visuals Studio (per panel)", targetPage: "visuals-studio" },
  { key: "export", label: "Export", targetPage: "export" },
];

const PROFILE_TAB_FIELDS = [
  "status_role",
  "appearance",
  "faction",
  "backstory",
  "personality",
  "powers",
  "arc",
];

function nowIso() {
  return new Date().toISOString();
}

function arrayify<T>(v: any): T[] {
  if (Array.isArray(v)) return v;
  if (v == null || v === "") return [];
  return [v];
}

export class AutoPilot {
  private cancelled = false;
  private reports: Record<PhaseKey, PhaseReport>;
  private idea = "";
  private title = "";

  constructor(
    private storyId: string,
    private onProgress: (reports: PhaseReport[]) => void,
  ) {
    this.reports = {} as Record<PhaseKey, PhaseReport>;
    for (const p of PHASES) {
      this.reports[p.key] = { key: p.key, label: p.label, status: "pending", warnings: [], detail: "" };
    }
  }

  getReports(): PhaseReport[] {
    return PHASES.map(p => this.reports[p.key]);
  }

  cancel() { this.cancelled = true; }

  // Read backend phase_status and mark already-completed orchestrator phases as done.
  async refreshStateFromStatus(): Promise<void> {
    try {
      const status = await api.storyStatus(this.storyId) as any;
      const ps: Record<string, string> = status?.phase_status || {};
      const map: Partial<Record<PhaseKey, () => boolean>> = {
        seed: () => ps.master_story === "completed",
        world: () => ps.world_core === "completed",
        cast_structure: () => ps.characters === "completed" || ps.characters === "in_progress",
        cast_profiles: () => ps.characters === "completed",
        relationships: () => ps.relationship_map === "completed",
        board: () => ps.plot_outline === "completed",
        scenes: () => ps.scene_cards === "completed",
        locations: () => ps.locations === "completed",
        // script / visuals / export are handled per-chapter — leave as pending
      };
      for (const [k, check] of Object.entries(map)) {
        if (check && check()) {
          const r = this.reports[k as PhaseKey];
          if (r.status === "pending") r.status = "done";
        }
      }
      this.notify();
    } catch {
      // Silent — first-load failure shouldn't block the user
    }
  }

  async run(idea: string, title?: string): Promise<void> {
    this.idea = idea;
    this.title = title || "";
    this.cancelled = false;
    for (const p of PHASES) {
      if (this.cancelled) return;
      const r = this.reports[p.key];
      if (r.status === "done" || r.status === "skipped") continue;
      await this.runOne(p.key); // throws on error → halts the loop
    }
  }

  async runFromPhase(key: PhaseKey): Promise<void> {
    const idx = PHASES.findIndex(p => p.key === key);
    if (idx < 0) return;
    this.cancelled = false;
    for (let i = idx; i < PHASES.length; i++) {
      if (this.cancelled) return;
      const k = PHASES[i].key;
      // Reset error state for the starting phase only
      if (i === idx) {
        this.reports[k].status = "pending";
        this.reports[k].error = undefined;
      }
      const r = this.reports[k];
      if (r.status === "done" || r.status === "skipped") continue;
      await this.runOne(k);
    }
  }

  // Mark a phase as skipped (user choice on error)
  skip(key: PhaseKey) {
    const r = this.reports[key];
    r.status = "skipped";
    r.endedAt = nowIso();
    this.notify();
  }

  // ── core dispatch ────────────────────────────────────────────────────────
  private async runOne(key: PhaseKey): Promise<void> {
    const r = this.reports[key];
    r.status = "running";
    r.error = undefined;
    r.warnings = [];
    r.detail = "";
    r.startedAt = nowIso();
    this.notify();
    try {
      switch (key) {
        case "seed": await this.doSeed(); break;
        case "world": await this.doWorld(); break;
        case "cast_structure": await this.doCastStructure(); break;
        case "cast_profiles": await this.doCastProfiles(); break;
        case "side": await this.doSide(); break;
        case "relationships": await this.doRelationships(); break;
        case "faction_visuals": await this.doFactionVisuals(); break;
        case "board": await this.doBoard(); break;
        case "scenes": await this.doScenes(); break;
        case "threads": await this.doThreads(); break;
        case "locations": await this.doLocations(); break;
        case "script": await this.doScript(); break;
        case "visuals": await this.doVisuals(); break;
        case "export": await this.doExport(); break;
      }
      r.status = "done";
      r.endedAt = nowIso();
      this.notify();
    } catch (e: any) {
      r.status = "error";
      r.error = e?.message || String(e);
      r.endedAt = nowIso();
      this.notify();
      throw e;
    }
  }

  private notify() {
    this.onProgress(this.getReports());
  }

  private addWarning(key: PhaseKey, msg: string) {
    this.reports[key].warnings.push(msg);
    this.notify();
  }

  private setDetail(key: PhaseKey, detail: string) {
    this.reports[key].detail = detail;
    this.notify();
  }

  private collectWarnings(key: PhaseKey, raw: any) {
    const w = raw?.warnings;
    if (Array.isArray(w)) {
      for (const item of w) if (item) this.addWarning(key, String(item));
    }
    if (raw?.used_fallback) {
      this.addWarning(key, "Used deterministic fallback (LLM disabled or failed).");
    }
  }

  // ── phases ───────────────────────────────────────────────────────────────

  // Patch a single master_story branch via the template endpoint.
  private async patchMasterBranch(branch: string, value: any): Promise<void> {
    await api.patchMasterStory(this.storyId, { target_branch: branch, operation: "replace", value });
  }

  private async doSeed() {
    this.setDetail("seed", "AI-generating title, story_type, foundation, ending…");
    const partial: any = { idea_so_far: this.idea };
    if (this.title) partial.title = this.title;
    const res = await api.aiFillField(this.storyId, {
      page: "seed",
      target_fields: ["title", "idea_so_far", "story_type", "story_foundation", "ending_direction"],
      partial_input: partial,
    });
    this.collectWarnings("seed", res);
    const gen = unwrapGeneratedFields(res);

    // Patch each branch individually — the /master-story/template endpoint
    // accepts one branch per call, not a multi-field body.
    if (gen.title) await this.patchMasterBranch("title", gen.title);
    await this.patchMasterBranch("idea_so_far", gen.idea_so_far || this.idea);

    const stType = this.toSelected(gen.story_type, true);
    if (stType?.selected?.length) await this.patchMasterBranch("story_type.selected", stType.selected);

    const foundation = this.toSelected(gen.story_foundation, false);
    if (foundation?.selected) await this.patchMasterBranch("story_foundation.selected", foundation.selected);

    const ending = this.toSelected(gen.ending_direction, false);
    if (ending?.selected) await this.patchMasterBranch("ending_direction.selected", ending.selected);
  }

  private async doWorld() {
    this.setDetail("world", "AI-generating world type, rules, factions, threats…");
    const res = await api.aiFillField(this.storyId, {
      page: "world",
      target_fields: [
        "world_type",
        "world_master_rules",
        "major_factions_and_ruling_sides",
        "major_threats_and_minor_side_threats",
      ],
      partial_input: {},
    });
    this.collectWarnings("world", res);
    const gen = unwrapGeneratedFields(res);

    // Patch only the .selected leaf branches — the endpoint doesn't accept
    // whole complex objects like world_master_rules directly.
    const selOf = (v: any): string[] => {
      if (!v) return [];
      const s = v.selected;
      if (Array.isArray(s)) return s.filter(Boolean);
      if (typeof s === "string" && s) return [s];
      return arrayify<string>(v).filter(Boolean);
    };

    const wt = selOf(gen.world_type)[0];
    if (wt) await this.patchMasterBranch("world_type.selected", wt);

    const wmSelected = selOf(gen.world_master_rules);
    if (wmSelected.length) await this.patchMasterBranch("world_master_rules.selected", wmSelected);
    if (gen.world_master_rules?.custom_rules) await this.patchMasterBranch("world_master_rules.custom_rules", gen.world_master_rules.custom_rules);

    const mfSelected = selOf(gen.major_factions_and_ruling_sides);
    if (mfSelected.length) await this.patchMasterBranch("major_factions_and_ruling_sides.selected", mfSelected);

    const mt = gen.major_threats_and_minor_side_threats || {};
    if (mt.major_threat) await this.patchMasterBranch("major_threats_and_minor_side_threats.major_threat", mt.major_threat);
    if (mt.minor_side_threats) await this.patchMasterBranch("major_threats_and_minor_side_threats.minor_side_threats", mt.minor_side_threats);
  }

  private async doCastStructure() {
    this.setDetail("cast_structure", "Setting character structure (default: Single Main Character)…");
    // Read existing characters.json to see if structure already chosen
    const chars = await api.getCharacters(this.storyId) as any;
    const existing = (chars?.content || chars || {}) as any;
    const already = existing?.main_character_structure?.selected;
    if (already && typeof already === "string" && already) {
      this.setDetail("cast_structure", `Already set: ${already}`);
      return;
    }
    await api.setCharacterStructure(this.storyId, {
      selected: "Single Main Character",
      requested_major_profiles: 2,
    });
  }

  private async doCastProfiles() {
    this.setDetail("cast_profiles", "Generating major character profiles…");
    const chars = await api.getCharacters(this.storyId) as any;
    const existing = (chars?.content || chars || {}) as any;
    const created: any[] = existing?.created_major_character_profiles || [];
    const queue: any[] = existing?.character_creation_queue?.queue || existing?.character_creation_queue || [];
    const target = Math.max(2, queue.length || 2);

    const existingNames = new Set(created.map((p: any) => (p.character_name || "").trim().toLowerCase()).filter(Boolean));
    const toCreate = Math.max(0, target - created.length);
    if (toCreate === 0) {
      this.setDetail("cast_profiles", `Already have ${created.length} profiles.`);
      return;
    }

    for (let i = 0; i < toCreate; i++) {
      this.setDetail("cast_profiles", `AI-generating profile ${created.length + i + 1}/${target}…`);
      const queuedHint = queue[created.length + i] || {};
      const res = await api.aiFillField(this.storyId, {
        page: "cast",
        target_fields: PROFILE_TAB_FIELDS,
        partial_input: {
          character_name: queuedHint.character_name || "",
          character_role_level: queuedHint.character_role_level || (i === 0 ? "Protagonist" : "Major"),
        },
        generation_hints: { profile_index: i, total: target },
      });
      this.collectWarnings("cast_profiles", res);
      const gen = unwrapGeneratedFields(res);

      // Resolve a name: prefer LLM, fallback to queued hint, then a placeholder
      let name = (gen.character_name || gen.name || queuedHint.character_name || `Character ${created.length + i + 1}`).toString().trim();
      // De-dup against existing names
      let suffix = 2;
      while (existingNames.has(name.toLowerCase())) {
        name = `${name} ${suffix++}`;
      }
      existingNames.add(name.toLowerCase());

      const profileId = `prof_${Date.now().toString(36)}_${i}`;
      const profileData = this.assembleProfileData(gen);

      await api.createCharacterProfile(this.storyId, {
        profile_id: profileId,
        character_name: name,
        profile_data: profileData,
      });
    }
  }

  private async doSide() {
    this.setDetail("side", "Generating side characters…");
    // Best-effort: 2 side characters
    for (let i = 0; i < 2; i++) {
      try {
        const res = await api.aiFillField(this.storyId, {
          page: "side",
          target_fields: ["appearance", "backstory", "personality", "faction"],
          partial_input: {},
          generation_hints: { side_index: i },
        });
        this.collectWarnings("side", res);
        const gen = unwrapGeneratedFields(res);
        const name = (gen.character_name || gen.name || `Side Character ${i + 1}`).toString().trim();
        await api.createSideCharacterProfile(this.storyId, {
          character_name: name,
          profile_data: gen,
        });
      } catch (e: any) {
        // Soft-fail: side characters are optional
        this.addWarning("side", `Side character ${i + 1} failed: ${e?.message || e}`);
      }
    }
  }

  private async doRelationships() {
    this.setDetail("relationships", "Analyzing relationships…");
    const chars = await api.getCharacters(this.storyId) as any;
    const majors = (chars?.content || chars || {})?.created_major_character_profiles || [];
    if (majors.length < 2) {
      this.skip("relationships");
      return;
    }
    const analysis = await api.analyzeRelationships(this.storyId) as any;
    this.collectWarnings("relationships", analysis);
    const proposals = analysis?.proposed_relationships || analysis?.relationships || [];
    if (!Array.isArray(proposals) || proposals.length === 0) {
      this.addWarning("relationships", "No relationships proposed; skipping apply.");
      return;
    }
    await api.applyRelationships(this.storyId, proposals);
  }

  private async doFactionVisuals() {
    this.setDetail("faction_visuals", "Generating faction visual signatures…");
    // Read master_story for the faction list
    const ms = await api.getMasterStory(this.storyId) as any;
    const msContent = (ms?.content || ms || {}) as any;
    const factions = msContent?.major_factions_and_ruling_sides?.selected || [];
    if (!Array.isArray(factions) || factions.length === 0) {
      this.skip("faction_visuals");
      return;
    }
    const res = await api.aiFillField(this.storyId, {
      page: "faction_visuals",
      target_fields: ["faction_visual_signatures"],
      partial_input: {
        major_factions_and_ruling_sides: msContent?.major_factions_and_ruling_sides || {},
      },
    });
    this.collectWarnings("faction_visuals", res);
    const gen = unwrapGeneratedFields(res);
    if (gen.faction_visual_signatures) {
      // Extract the signatures array from whatever shape the LLM returns.
      const sigs = Array.isArray(gen.faction_visual_signatures)
        ? gen.faction_visual_signatures
        : (gen.faction_visual_signatures?.signatures || []);
      if (sigs.length > 0) {
        await this.patchMasterBranch("faction_visual_signatures.signatures", sigs);
      }
    }
  }

  private async doBoard() {
    this.setDetail("board", "Setting narrative structure + AI-generating arc + chapters…");
    // 1. Set narrative structure (default: Three-Act Structure)
    const plot = await api.getPlotOutline(this.storyId) as any;
    const plotContent = (plot?.content || plot || {}) as any;
    const ns = plotContent?.narrative_structure?.selected;
    if (!ns) {
      await api.patchNarrativeStructure(this.storyId, { selected: "Three-Act Structure" });
    }

    // 2. Generate arc + chapters
    const res = await api.aiFillField(this.storyId, {
      page: "board",
      target_fields: ["arc_overview", "chapters"],
      partial_input: {},
      generation_hints: { arc_length: "Short Arc" }, // 3-5 chapters keeps runtime sane
    });
    this.collectWarnings("board", res);
    const gen = unwrapGeneratedFields(res);

    // 3. Patch arc overview
    if (gen.arc_overview && typeof gen.arc_overview === "object") {
      try {
        await api.patchArcOverview(this.storyId, gen.arc_overview);
      } catch (e: any) {
        this.addWarning("board", `Arc overview patch failed: ${e?.message}`);
      }
    }

    // 4. Create chapters
    const chapters = Array.isArray(gen.chapters) ? gen.chapters : [];
    if (chapters.length === 0) {
      throw new Error("AI returned no chapters; cannot proceed without a chapter list.");
    }
    let i = 0;
    for (const ch of chapters) {
      i++;
      this.setDetail("board", `Creating chapter ${i}/${chapters.length}…`);
      const body: any = { ...ch };
      if (!body.chapter_number) body.chapter_number = i;
      if (!body.chapter_title) body.chapter_title = `Chapter ${i}`;
      try {
        await api.createChapter(this.storyId, body);
      } catch (e: any) {
        this.addWarning("board", `Chapter ${i} create failed: ${e?.message}`);
      }
    }
  }

  private async doScenes() {
    this.setDetail("scenes", "Generating scene cards per chapter…");
    const plot = await api.getPlotOutline(this.storyId) as any;
    const plotContent = (plot?.content || plot || {}) as any;
    const chapters: any[] = plotContent?.chapter_or_episode_list?.chapters || [];
    if (chapters.length === 0) {
      this.skip("scenes");
      return;
    }
    let chIdx = 0;
    for (const ch of chapters) {
      chIdx++;
      this.setDetail("scenes", `Generating scenes ${chIdx}/${chapters.length}…`);
      try {
        const res = await api.aiFillField(this.storyId, {
          page: "scenes",
          target_fields: ["scenes_for_chapter"],
          partial_input: { selected_chapter_ids: [ch.chapter_id] },
          generation_hints: { scenes_per_chapter: 3 },
        });
        this.collectWarnings("scenes", res);
        const gen = unwrapGeneratedFields(res);
        const scenes = arrayify<any>(gen.scenes_for_chapter || gen.scenes);
        for (const sc of scenes) {
          try {
            await api.createScene(this.storyId, { ...sc, chapter_id: sc.chapter_id || ch.chapter_id });
          } catch (e: any) {
            this.addWarning("scenes", `Scene create failed (ch ${chIdx}): ${e?.message}`);
          }
        }
      } catch (e: any) {
        this.addWarning("scenes", `Scenes generation failed (ch ${chIdx}): ${e?.message}`);
      }
    }
  }

  private async doThreads() {
    this.setDetail("threads", "Generating plot threads (best-effort enrichment)…");
    try {
      const res = await api.aiFillField(this.storyId, {
        page: "threads",
        target_fields: ["main", "character_arcs", "relationships", "threats", "powers"],
        partial_input: {},
      });
      this.collectWarnings("threads", res);
      // Threads are written by the LLM call directly through the universal endpoint;
      // there is no canonical PATCH route, so we just rely on the result for context.
      // If the backend doesn't auto-persist, this still serves as enrichment for downstream calls.
      const gen = unwrapGeneratedFields(res);
      if (!gen || Object.keys(gen).length === 0) {
        this.addWarning("threads", "No thread fields returned; continuing.");
      }
    } catch (e: any) {
      // Threads are optional enrichment — soft-fail
      this.addWarning("threads", `Threads generation failed: ${e?.message}`);
    }
  }

  private async doLocations() {
    this.setDetail("locations", "Generating locations…");
    const existing = await api.listLocations(this.storyId) as any[];
    const named = (existing || []).filter((l: any) => (l?.name || "").trim());
    if (named.length > 0) {
      this.setDetail("locations", `Already have ${named.length} named locations.`);
      return;
    }
    const res = await api.aiGenerateAllLocations(this.storyId, {
      generation_hints: { count: 6 },
    });
    this.collectWarnings("locations", res);
    // Verify at least one named location now exists (the backend gate requires this)
    const after = await api.listLocations(this.storyId) as any[];
    const namedAfter = (after || []).filter((l: any) => (l?.name || "").trim());
    if (namedAfter.length === 0) {
      throw new Error("Location generation produced no named locations. Open Locations page to fix manually.");
    }
  }

  private async doScript() {
    this.setDetail("script", "Generating + approving all chapters via batch endpoint…");
    const plot = await api.getPlotOutline(this.storyId) as any;
    const chapters: any[] = (plot?.content || plot || {})?.chapter_or_episode_list?.chapters || [];
    if (chapters.length === 0) throw new Error("No chapters found; cannot script.");

    const status = await api.getChapterScriptStatuses(this.storyId) as any;
    const statusMap: Record<string, any> = {};
    for (const s of (status?.chapters || [])) statusMap[s.chapter_id] = s;

    const ordered = [...chapters].sort((a: any, b: any) => (Number(a.chapter_number) || 0) - (Number(b.chapter_number) || 0));
    const todo = ordered.filter((ch: any) => {
      const st = statusMap[ch.chapter_id];
      return !(st?.has_script && st?.approved && !st?.is_current);
    });

    if (todo.length === 0) {
      this.setDetail("script", "All chapters already approved.");
      return;
    }

    this.setDetail("script", `Batch-generating ${todo.length} chapter(s)…`);
    const result = await api.generateBatchApprove(this.storyId, todo.map((ch: any) => ch.chapter_id)) as any;
    const processed = result?.chapters_processed ?? 0;
    const failed = result?.chapters_failed ?? 0;
    if (failed > 0) {
      this.addWarning("script", `${failed} chapter(s) failed during batch generation.`);
    }
    this.setDetail("script", `Done: ${processed} generated, ${failed} failed.`);
  }

  private async doVisuals() {
    this.setDetail("visuals", "Filling all chapter visuals via batch endpoint…");
    const status = await api.getChapterScriptStatuses(this.storyId) as any;
    const chapters: any[] = (status?.chapters || []).filter((c: any) => c.has_script);
    if (chapters.length === 0) {
      this.skip("visuals");
      return;
    }

    const locsRaw = await api.listLocations(this.storyId) as any[];
    const locations = (locsRaw || []).map((l: any) => ({
      location_id: l.location_id,
      name: l.name,
      type: l.type || "",
    }));

    this.setDetail("visuals", `Batch-filling visuals for ${chapters.length} chapter(s)…`);
    const result = await api.fillVisualsAllBatch(this.storyId, {
      chapter_ids: chapters.map((c: any) => c.chapter_id),
      available_locations: locations,
    }) as any;

    const processed = result?.chapters_processed ?? 0;
    const skipped = result?.chapters_skipped ?? 0;
    const failed = result?.chapters_failed ?? 0;
    if (failed > 0) {
      this.addWarning("visuals", `${failed} chapter(s) failed during batch visuals fill.`);
    }
    this.setDetail("visuals", `Done: ${processed} filled, ${skipped} skipped, ${failed} failed.`);
  }

  private async doExport() {
    this.setDetail("export", "Downloading triple-zip bundle…");
    const { blob, filename } = await exportApi.tripleZip(this.storyId);
    triggerBlobDownload(blob, filename);
    this.setDetail("export", `Downloaded: ${filename}`);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  // Wrap a generated value into the {selected, options} shape master_story uses.
  // - allowMulti=true for fields like story_type which accept arrays.
  // - The patch endpoint deep-merges, so we only need to set 'selected'.
  private toSelected(value: any, allowMulti: boolean): any {
    if (value == null || value === "") return undefined;
    if (typeof value === "object" && !Array.isArray(value) && "selected" in value) {
      return value;
    }
    const arr = arrayify<any>(value).filter(v => v != null && v !== "");
    if (arr.length === 0) return undefined;
    return { selected: allowMulti ? arr : arr[0] };
  }

  // Build a profile_data object from generated_fields, mapping AI keys onto
  // the 7 ProfileTabs sections expected by createCharacterProfile.
  private assembleProfileData(gen: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const k of PROFILE_TAB_FIELDS) {
      if (gen[k] !== undefined) out[k] = gen[k];
    }
    // Common alternative keys — be lenient about what the LLM returns.
    if (gen.character_appearance && !out.appearance) out.appearance = gen.character_appearance;
    if (gen.character_personality && !out.personality) out.personality = gen.character_personality;
    if (gen.character_backstory && !out.backstory) out.backstory = gen.character_backstory;
    if (gen.character_arc && !out.arc) out.arc = gen.character_arc;
    if (gen.character_powers && !out.powers) out.powers = gen.character_powers;
    return out;
  }
}
