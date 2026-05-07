"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getUsableAiOutput } from "@/lib/aiResults";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { ProfileTabs } from "@/components/forms/ProfileTabs";
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
  const sideProfiles = content.created_side_character_profiles || [];
  const majorCount = content.created_major_character_profiles_count || 0;

  const aiGen = useMutation({
    mutationFn: () => api.aiGenerate(storyId, {
      page: "side",
      target_fields: aiSideFields,
      partial_input: { ...profileData, profile_id: editingProfileId, character_name: name },
      generation_hints: { edit_existing: true, profile_id: editingProfileId, character_name: name },
    }),
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
    onSuccess: () => { chars.refetch(); setName(""); setProfileData({}); setEditingIdx(null); setEditingProfileId(null); },
  });

  const updateSide = useMutation({
    mutationFn: ({ profileId, body }: { profileId: string; body: any }) => api.updateSideCharacterProfile(storyId, profileId, body),
    onSuccess: () => { chars.refetch(); setName(""); setProfileData({}); setEditingIdx(null); setEditingProfileId(null); },
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
  }

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Side Cast" subtitle="Supporting characters, minor roles, NPCs, and extras.">
        <div className="mb-4 flex items-center gap-3 text-sm">
          <span className="font-bold">Major: <span className="text-amber-700">{majorCount}</span></span>
          <span className="font-bold">Side: <span className="text-indigo-600">{sideProfiles.length}</span></span>
        </div>

        {sideProfiles.length > 0 && (
          <div className="mb-5 space-y-2">
            <h3 className="font-black text-sm">Created Side Characters</h3>
            {sideProfiles.map((p: any, i: number) => (
              <div key={p.profile_id || i} className="rounded-lg border-2 border-slate-200 bg-white p-3 flex items-center justify-between">
                <div>
                  <span className="font-bold">{p.character_name || "Unnamed"}</span>
                  <span className="ml-2 text-xs text-slate-500">{safeRole(p)}</span>
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
