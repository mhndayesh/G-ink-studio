"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getUsableAiOutput } from "@/lib/aiResults";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { ProfileTabs, PROFILE_OPTS } from "@/components/forms/ProfileTabs";
import { AiFillPanel } from "@/components/forms/AiFillPanel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { mapCharacterAiToProfileData, normalizeCharacterProfileForEditor } from "@/lib/profileAiMapping";

function safeRole(p: any): string {
  const rl = p?.character_role_level;
  if (!rl) return "";
  if (typeof rl === "string") return rl;
  if (typeof rl.selected === "string") return rl.selected;
  if (rl.selected && typeof rl.selected === "object") return rl.selected.selected || "";
  return "";
}

function deepMergeProfile(base: Record<string, any>, updates: Record<string, any>): Record<string, any> {
  const out = JSON.parse(JSON.stringify(base || {}));
  for (const [key, value] of Object.entries(updates || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])) {
      out[key] = deepMergeProfile(out[key], value as Record<string, any>);
    } else {
      out[key] = value;
    }
  }
  return out;
}

const SIDE_AI_FIELDS = [
  { key: "status_role", label: "Status & Role", description: "Character status and role level" },
  { key: "appearance", label: "Appearance", description: "Visual design, body, outfit, colors" },
  { key: "faction", label: "Faction Alignment", description: "Faction links, loyalty, allegiance" },
  { key: "backstory", label: "Backstory", description: "Past, mental state, community place" },
  { key: "personality", label: "Personality", description: "Traits, behavior, speech, quirks" },
  { key: "story_role", label: "Story Role & Fate", description: "Narrative function, connection to protagonist, and fate" },
];

const STORY_FUNCTION_OPTS = [
  "mentor_guide", "tragic_sacrifice", "comic_relief", "love_interest",
  "rival_turned_ally", "informant", "protective_figure", "betrayer",
  "catalyst", "loyal_companion", "obstacle", "foil", "villain_origin",
];

const NARRATIVE_FATE_OPTS = [
  "survives_story", "dies_heroically", "dies_tragically",
  "betrays_protagonist", "redeemed", "disappears", "exiled",
  "arrested", "transforms", "unknown",
];

export default function SideCastPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const chars = useQuery({ queryKey: ["characters", storyId], queryFn: () => api.getCharacters(storyId) });
  const content = (chars.data?.content || chars.data || {}) as any;
  const [name, setName] = useState("");
  const [profileData, setProfileData] = useState<Record<string, any>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [aiSideFields, setAiSideFields] = useState<string[]>([]);
  const [aiSideResults, setAiSideResults] = useState<Record<string, any> | null>(null);
  const [aiSideError, setAiSideError] = useState<string | null>(null);
  const [aiApplyCounter, setAiApplyCounter] = useState(0);
  const [charNotes, setCharNotes] = useState("");
  const sideProfiles = content.created_side_character_profiles || [];
  const majorCount = content.created_major_character_profiles_count || 0;

  const aiGen = useMutation({
    mutationFn: () => {
      const opts: Record<string, string[]> = {};
      if (aiSideFields.includes("status_role")) { opts.status_options = PROFILE_OPTS.STATUS_OPTS; opts.role_options = PROFILE_OPTS.ROLE_OPTS; }
      if (aiSideFields.includes("appearance")) opts.visual_style_options = PROFILE_OPTS.VISUAL_STYLE_OPTS;
      if (aiSideFields.includes("faction")) opts.faction_alignment_options = PROFILE_OPTS.FACTION_ALIGN_OPTS;
      if (aiSideFields.includes("backstory")) { opts.backstory_type_options = PROFILE_OPTS.BACKSTORY_OPTS; opts.mental_state_options = PROFILE_OPTS.MENTAL_STATE_OPTS; opts.community_place_options = PROFILE_OPTS.COMMUNITY_OPTS; }
      if (aiSideFields.includes("personality")) opts.personality_type_options = PROFILE_OPTS.PERSONALITY_OPTS;
      if (aiSideFields.includes("story_role")) { opts.story_function_options = STORY_FUNCTION_OPTS; opts.narrative_fate_options = NARRATIVE_FATE_OPTS; }
      const hints: any = { edit_existing: true, profile_id: editingProfileId, character_name: name };
      if (charNotes.trim()) hints.user_character_notes = charNotes.trim();
      return api.aiGenerate(storyId, {
        page: "side",
        target_fields: aiSideFields,
        partial_input: { ...profileData, profile_id: editingProfileId, character_name: name, ...opts },
        generation_hints: hints,
      });
    },
    onSuccess: (d: any) => {
      let gen: Record<string, any>;
      try {
        gen = getUsableAiOutput("side", aiSideFields, d);
        setAiSideError(null);
      } catch (err: any) {
        setAiSideResults(null);
        setAiSideError(err?.message || AI_EMPTY_MESSAGE);
        return;
      }
      setAiSideResults(gen);
    },
    onError: (err: any) => {
      setAiSideResults(null);
      setAiSideError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });

  const createSide = useMutation({
    mutationFn: (body: any) => api.createSideCharacterProfile(storyId, body),
    onSuccess: () => { chars.refetch(); setName(""); setProfileData({}); setEditingIdx(null); setEditingProfileId(null); setCharNotes(""); },
  });

  const updateSide = useMutation({
    mutationFn: ({ profileId, body }: { profileId: string; body: any }) => api.updateSideCharacterProfile(storyId, profileId, body),
    onSuccess: () => { chars.refetch(); setName(""); setProfileData({}); setEditingIdx(null); setEditingProfileId(null); setCharNotes(""); },
  });

  const deleteSideMut = useMutation({
    mutationFn: (profileId: string) => api.deleteSideCharacterProfile(storyId, profileId),
    onSuccess: (d: any) => {
      chars.refetch();
      setName(""); setProfileData({}); setEditingIdx(null); setEditingProfileId(null);
      if (d?.cross_reference_warnings?.length > 0) {
        const warnings = d.cross_reference_warnings.map((w: any) => `• ${w.detail}`).join("\n");
        alert(`⚠️ Side character deleted. Cross-references were cleaned up:\n${warnings}\n\nPlease review affected pages.`);
      }
    },
  });

  const conflictCheck = useMutation({
    mutationFn: ({ profileId, newName }: { profileId: string; newName: string }) => api.checkCharacterConflicts(storyId, profileId, newName),
  });

  const [syncResult, setSyncResult] = useState<{ created: string[]; count: number } | null>(null);
  const syncSpeakers = useMutation({
    mutationFn: () => api.syncScriptSpeakers(storyId),
    onSuccess: (d: any) => {
      chars.refetch();
      setSyncResult({ created: d.created || [], count: d.count || 0 });
    },
  });

  const [autoGenResult, setAutoGenResult] = useState<{ created: string[]; count: number; used_fallback: boolean } | null>(null);
  const autoGenSide = useMutation({
    mutationFn: () => api.autoGenerateSideCast(storyId),
    onSuccess: (d: any) => {
      chars.refetch();
      setAutoGenResult({ created: d.created || [], count: d.count || 0, used_fallback: d.used_fallback || false });
    },
  });

  function handleApplyEi(results: any) {
    setProfileData((prev) => deepMergeProfile(prev, mapCharacterAiToProfileData(results?.generated_fields || results || {}, false)));
    setAiSideResults(null);
    setAiApplyCounter(c => c + 1);
  }

  async function handleCreate() {
    if (!name) return;
    const conflicts = await conflictCheck.mutateAsync({ profileId: "new", newName: name });
    if (conflicts?.has_conflicts) {
      const msg = conflicts.conflicts.map((c: any) => `• ${c.message}`).join("\n");
      const ok = window.confirm(`⚠️ Conflicts detected:\n${msg}\n\nCreate anyway?`);
      if (!ok) return;
    }
    createSide.mutate({ character_name: name, profile_data: profileData });
  }

  async function handleEdit(index: number) {
    const p = sideProfiles[index];
    const normalized = normalizeCharacterProfileForEditor(p, false);
    setEditingIdx(index);
    setEditingProfileId(p.profile_id);
    setName(p.character_name || "");
    setProfileData(normalized);
    setAiApplyCounter(c => c + 1);
  }

  async function handleUpdate() {
    if (!name || !editingProfileId) return;
    const conflicts = await conflictCheck.mutateAsync({ profileId: editingProfileId, newName: name });
    if (conflicts?.has_conflicts) {
      const msg = conflicts.conflicts.map((c: any) => `• ${c.message}`).join("\n");
      const ok = window.confirm(`⚠️ Conflicts detected:\n${msg}\n\nSave anyway?`);
      if (!ok) return;
    }
    updateSide.mutate({ profileId: editingProfileId, body: { character_name: name, profile_data: profileData } });
  }

  function handleCancel() {
    setEditingIdx(null);
    setEditingProfileId(null);
    setName("");
    setProfileData({});
    setCharNotes("");
  }

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Side Cast" subtitle="Supporting characters, minor roles, NPCs, and extras.">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold">Major: <span className="text-amber-700">{majorCount}</span></span>
          <span className="font-bold">Side: <span className="text-indigo-600">{sideProfiles.length}</span></span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              className="rounded-xl border-2 border-violet-600 bg-violet-50 px-3 py-1.5 text-xs font-black text-violet-800 hover:bg-violet-100 disabled:opacity-50"
              onClick={() => {
                if (!confirm("Analyse the full story and auto-generate side characters that fit the narrative.\n\nExisting profiles are never overwritten.\n\nThis may take 15–30 seconds if LLM is enabled.")) return;
                setAutoGenResult(null);
                autoGenSide.mutate();
              }}
              disabled={autoGenSide.isPending}
              title="AI reads your story and creates fully-formed side characters it finds implied in the narrative"
            >
              {autoGenSide.isPending ? "Generating…" : "✦ Auto-Generate from Story"}
            </button>
            <button
              className="rounded-xl border-2 border-indigo-600 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
              onClick={() => {
                if (!confirm("Scan all chapter scripts and create stub side profiles for any speaker without one?\n\nSafe to run multiple times — existing profiles are never overwritten.")) return;
                setSyncResult(null);
                syncSpeakers.mutate();
              }}
              disabled={syncSpeakers.isPending}
              title="Create stub side profiles for every script speaker that has no profile yet"
            >
              {syncSpeakers.isPending ? "Scanning…" : "⚡ Sync Script Speakers"}
            </button>
          </div>
        </div>
        {autoGenResult && (
          <div className={`mb-3 rounded-xl border-2 p-3 text-xs ${autoGenResult.count > 0 ? "border-violet-400 bg-violet-50 text-violet-800" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
            {autoGenResult.used_fallback && (
              <span className="mb-1 block font-bold text-amber-700">⚠ LLM not configured — deterministic fallback used. Enable LLM to get story-specific characters.</span>
            )}
            {autoGenResult.count > 0
              ? `Created ${autoGenResult.count} side character(s): ${autoGenResult.created.join(", ")}. Each has a full profile and story role — edit to refine.`
              : "No new side characters were generated (all implied characters may already exist)."}
          </div>
        )}
        {autoGenSide.isError && <div className="mb-3 text-xs text-red-700 font-bold">Auto-generate failed — check backend logs.</div>}
        {syncResult && (
          <div className={`mb-3 rounded-xl border-2 p-3 text-xs ${syncResult.count > 0 ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-50 text-slate-600"}`}>
            {syncResult.count > 0
              ? `Created ${syncResult.count} stub profile(s): ${syncResult.created.join(", ")}. AI-fill each one to flesh it out.`
              : "All script speakers already have profiles — nothing to create."}
          </div>
        )}
        {syncSpeakers.isError && <div className="mb-3 text-xs text-red-700 font-bold">Sync failed — check backend logs.</div>}

        {sideProfiles.length > 0 && (
          <div className="mb-5 space-y-2">
            <h3 className="font-black text-sm">Created Side Characters</h3>
            {sideProfiles.map((p: any, i: number) => (
              <div key={p.profile_id || i} className="rounded-lg border-2 border-slate-200 bg-white p-3 flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-1 min-w-0">
                  <span className="font-bold">{p.character_name || "Unnamed"}</span>
                  <span className="ml-1 text-xs text-slate-500">{safeRole(p)}</span>
                  {p.story_role?.story_function && (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 capitalize">
                      {String(p.story_role.story_function).replace(/_/g, " ")}
                    </span>
                  )}
                  {p.story_role?.narrative_fate && (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 capitalize">
                      {String(p.story_role.narrative_fate).replace(/_/g, " ")}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button className="text-xs font-bold text-indigo-600 underline" onClick={() => handleEdit(i)}>Edit</button>
                  <button className="text-xs font-bold text-red-500 underline" disabled={deleteSideMut.isPending} onClick={() => { if (deleteSideMut.isPending) return; if (confirm(`Delete side character "${p.character_name || p.profile_id}"?`)) deleteSideMut.mutate(p.profile_id); }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-black text-sm">{editingIdx !== null ? "Edit Side Character" : "Add Side Character"}</h3>
          {(editingIdx !== null) && (
            <button onClick={handleCancel} className="text-xs font-bold text-slate-500 underline">Cancel editing</button>
          )}
          {editingIdx !== null && (
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-3 sm:rounded-2xl">
              <Field
                label="Notes / hints to AI"
                value={charNotes}
                onChange={setCharNotes}
                textarea
                placeholder="e.g. 'a grumpy old landlord who secretly protects the protagonist, comedic but has a hidden past'"
              />
              <p className="mt-1 text-xs text-amber-700 font-bold">These notes are sent to AI with every field generation — describe the character&apos;s role, personality, or anything you have in mind.</p>
            </div>
          )}
          {editingIdx !== null && (
            <AiFillPanel
              page="side"
              fields={SIDE_AI_FIELDS}
              note="AI fills the currently edited side character only, using this profile's existing fields plus the whole story context."
              onFieldSelect={setAiSideFields}
              onGenerate={() => aiGen.mutate()}
              loading={aiGen.isPending}
              results={aiSideResults}
              onClear={() => setAiSideResults(null)}
              onApply={handleApplyEi}
              disabled={!editingProfileId || !name}
              disabledReason="Open an existing side character and keep its name before using AI fill."
              error={aiSideError}
              onDismissError={() => setAiSideError(null)}
            />
          )}
          <ProfileTabs key={`${editingProfileId || "new"}-${aiApplyCounter}`} resetKey={`${editingProfileId || "new"}-${aiApplyCounter}`} onDataChange={setProfileData} initialData={profileData} />
          {editingIdx !== null && (
            <div className="rounded-xl border-2 border-violet-200 bg-violet-50 p-4 space-y-3">
              <div>
                <h4 className="font-black text-sm text-violet-900">Story Role & Fate</h4>
                <p className="mt-0.5 text-xs text-violet-700">How does this character connect to the story and what happens to them?</p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold">Story Function</label>
                <div className="flex flex-wrap gap-2">
                  {STORY_FUNCTION_OPTS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      className={`rounded-lg border-2 px-2.5 py-1 text-xs font-bold capitalize transition-colors ${
                        profileData?.story_role?.story_function === opt
                          ? "border-violet-600 bg-violet-600 text-white"
                          : "border-slate-300 bg-white hover:border-violet-400"
                      }`}
                      onClick={() => setProfileData(prev => ({ ...prev, story_role: { ...(prev.story_role || {}), story_function: opt } }))}
                    >
                      {opt.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              <Field
                label="Relationship to protagonist"
                value={profileData?.story_role?.relationship_to_protagonist || ""}
                onChange={v => setProfileData(prev => ({ ...prev, story_role: { ...(prev.story_role || {}), relationship_to_protagonist: v } }))}
                placeholder="e.g. Father of Kinji, estranged for 10 years"
              />
              <div>
                <label className="mb-1 block text-xs font-bold">Narrative Fate</label>
                <div className="flex flex-wrap gap-2">
                  {NARRATIVE_FATE_OPTS.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      className={`rounded-lg border-2 px-2.5 py-1 text-xs font-bold capitalize transition-colors ${
                        profileData?.story_role?.narrative_fate === opt
                          ? "border-rose-600 bg-rose-600 text-white"
                          : "border-slate-300 bg-white hover:border-rose-400"
                      }`}
                      onClick={() => setProfileData(prev => ({ ...prev, story_role: { ...(prev.story_role || {}), narrative_fate: opt } }))}
                    >
                      {opt.replace(/_/g, " ")}
                    </button>
                  ))}
                </div>
              </div>
              <Field
                label="Story impact"
                value={profileData?.story_role?.story_impact || ""}
                onChange={v => setProfileData(prev => ({ ...prev, story_role: { ...(prev.story_role || {}), story_impact: v } }))}
                textarea
                placeholder="e.g. His death in chapter 3 is what pushes the protagonist to take up the fight."
              />
            </div>
          )}
          <Field label="Character name" value={name} onChange={setName} placeholder="Old Man Sho, Villager #3..." />
          {editingIdx !== null ? (
            <button
              className="rounded-xl border-2 border-indigo-600 bg-indigo-600 px-5 py-3 text-sm font-black text-white"
              onClick={handleUpdate}
              disabled={!name || updateSide.isPending}
            >
              {updateSide.isPending ? "Saving..." : "Update Side Character"}
            </button>
          ) : (
            <button
              className="rounded-xl border-2 border-indigo-600 bg-indigo-600 px-5 py-3 text-sm font-black text-white"
              onClick={handleCreate}
              disabled={!name || createSide.isPending}
            >
              {createSide.isPending ? "Saving..." : "Create Side Character"}
            </button>
          )}
          {createSide.isError && <ErrorBanner error={createSide.error as Error} />}
          {updateSide.isError && <ErrorBanner error={updateSide.error as Error} />}
          {deleteSideMut.isError && <ErrorBanner error={deleteSideMut.error as Error} />}
        </div>
      </Panel>
      <Panel title="characters.json"><StructuredJsonView data={{ major_count: majorCount, side_profiles: sideProfiles }} /></Panel>
    </div>
  );
}
