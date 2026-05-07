"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getUsableAiOutput } from "@/lib/aiResults";
import { useHydrateOnce } from "@/lib/hooks/useHydrate";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { OptionGrid } from "@/components/forms/OptionGrid";
import { ProfileTabs } from "@/components/forms/ProfileTabs";
import { AiFillPanel } from "@/components/forms/AiFillPanel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { mapCharacterAiToProfileData, normalizeCharacterProfileForEditor } from "@/lib/profileAiMapping";

const CAST_AI_FIELDS = [
  { key: "status_role", label: "Status & Role", description: "Character status and role level" },
  { key: "appearance", label: "Appearance", description: "Visual design, body, outfit, colors" },
  { key: "faction", label: "Faction Alignment", description: "Faction links, loyalty, allegiance" },
  { key: "backstory", label: "Backstory", description: "Past, mental state, community place" },
  { key: "personality", label: "Personality", description: "Traits, behavior, speech, quirks" },
  { key: "powers", label: "Powers", description: "Origin, type, level, abilities, limits" },
  { key: "arc", label: "Arc & Threats", description: "Character arc, threat connections, stakes" },
];

function cid() {
  return `char_${Date.now().toString(36).slice(-4)}_${Math.random().toString(36).slice(2, 6)}`;
}

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

export default function CastPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const chars = useQuery({ queryKey: ["characters", storyId], queryFn: () => api.getCharacters(storyId) });
  const content = (chars.data?.content || chars.data || {}) as any;
  const [structure, setStructure] = useState("");
  const [name, setName] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<string | null>(null);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<Record<string, any>>({});
  const [aiFields, setAiFields] = useState<string[]>([]);
  const [aiResults, setAiResults] = useState<Record<string, any> | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiApplyCounter, setAiApplyCounter] = useState(0);
  // Hydrate the character-structure picker from saved data so reopening Cast
  // Forge doesn't show "no selection" while the JSON already has a structure.
  useHydrateOnce(!!chars.data, storyId, () => {
    const c = (chars.data?.content || chars.data || {}) as any;
    const sel = c.main_character_structure?.selected;
    if (typeof sel === "string" && sel) setStructure(sel);
  });

  const setStruct = useMutation({ mutationFn: (body: any) => api.setCharacterStructure(storyId, body), onSuccess: () => chars.refetch() });
  const createProfile = useMutation({ mutationFn: (body: any) => api.createCharacterProfile(storyId, body), onSuccess: () => { chars.refetch(); setName(""); setSelectedProfile(null); setEditProfileId(null); setProfileData({}); } });
  const updateProfile = useMutation({
    mutationFn: ({ profileId, body }: { profileId: string; body: any }) => api.updateCharacterProfile(storyId, profileId, body),
    onSuccess: () => { chars.refetch(); setName(""); setSelectedProfile(null); setEditProfileId(null); setProfileData({}); },
  });
  const deleteProfileMut = useMutation({
    mutationFn: (profileId: string) => api.deleteCharacterProfile(storyId, profileId),
    onSuccess: (d: any) => {
      chars.refetch();
      setName(""); setSelectedProfile(null); setEditProfileId(null); setProfileData({});
      if (d?.cross_reference_warnings?.length > 0) {
        const warnings = d.cross_reference_warnings.map((w: any) => `• ${w.detail}`).join("\n");
        alert(`⚠️ Character deleted. Cross-references were cleaned up:\n${warnings}\n\nPlease review affected pages.`);
      }
    },
  });
  const conflictCheck = useMutation({
    mutationFn: ({ profileId, newName }: { profileId: string; newName: string }) => api.checkCharacterConflicts(storyId, profileId, newName),
  });
  const activate = useMutation({ mutationFn: () => api.activateRelationshipMap(storyId), onSuccess: () => chars.refetch() });
  const created = content.created_major_character_profiles || [];

  const aiGen = useMutation({
    mutationFn: () => {
      const hints: any = {
        edit_existing: true,
        profile_id: editProfileId,
        character_name: name,
      };
      return api.aiGenerate(storyId, {
        page: "cast",
        target_fields: aiFields,
        partial_input: { ...profileData, profile_id: editProfileId, character_name: name },
        generation_hints: hints,
      });
    },
    onSuccess: (d: any) => {
      let gen: Record<string, any>;
      try {
        gen = getUsableAiOutput("cast", aiFields, d);
        setAiError(null);
      } catch (err: any) {
        setAiResults(null);
        setAiError(err?.message || AI_EMPTY_MESSAGE);
        return;
      }
      setAiResults(gen);
    },
    onError: (err: any) => {
      setAiResults(null);
      setAiError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });

  async function handleCreateProfile() {
    if (!name || !selectedProfile) return;
    const conflicts = await conflictCheck.mutateAsync({ profileId: selectedProfile, newName: name });
    if (conflicts?.has_conflicts) {
      const msg = conflicts.conflicts.map((c: any) => `• ${c.message}`).join("\n");
      const ok = window.confirm(`⚠️ Conflicts detected:\n${msg}\n\nCreate anyway?`);
      if (!ok) return;
    }
    createProfile.mutate({ profile_id: selectedProfile, character_name: name, profile_data: profileData });
  }

  function handleEditProfile(profile: any) {
    const normalized = normalizeCharacterProfileForEditor(profile, true);
    setEditProfileId(profile.profile_id);
    setSelectedProfile(null);
    setName(profile.character_name || "");
    setProfileData(normalized);
    setAiApplyCounter(c => c + 1);
  }

  async function handleUpdateProfile() {
    if (!name || !editProfileId) return;
    const conflicts = await conflictCheck.mutateAsync({ profileId: editProfileId, newName: name });
    if (conflicts?.has_conflicts) {
      const msg = conflicts.conflicts.map((c: any) => `• ${c.message}`).join("\n");
      const ok = window.confirm(`⚠️ Conflicts detected:\n${msg}\n\nDo you want to save anyway?`);
      if (!ok) return;
    }
    updateProfile.mutate({ profileId: editProfileId, body: { character_name: name, profile_data: profileData } });
  }

  function handleApplyAi(results: any) {
    setProfileData((prev) => deepMergeProfile(prev, mapCharacterAiToProfileData(results?.generated_fields || results || {}, true)));
    setAiResults(null);
    setAiApplyCounter(c => c + 1);
  }

  function handleCancelEdit() {
    setEditProfileId(null);
    setSelectedProfile(null);
    setName("");
    setProfileData({});
  }

  function handleAddCharacter() {
    const newId = cid();
    setSelectedProfile(newId);
    setEditProfileId(null);
    setName("New Character");
    setProfileData({});
  }

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Cast Forge" subtitle="Create and manage your major characters.">
        <div className="space-y-5">
          <div><h3 className="mb-2 font-black">Who carries the story?</h3><OptionGrid options={content.main_character_structure?.options || []} selected={structure} onSelect={setStructure} /></div>
          <button className="w-full rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:w-auto sm:rounded-2xl sm:text-base" onClick={() => setStruct.mutate({ selected: structure })} disabled={!structure || setStruct.isPending}>Apply Structure</button>

          <div className="rounded-xl border-2 border-slate-900 bg-indigo-50 p-4 sm:rounded-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-black">Created Characters ({created.length})</h3>
              <button onClick={handleAddCharacter} className="text-xs font-bold text-indigo-600 underline">+ Add Character</button>
            </div>
            {created.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {created.map((p: any) => {
                  const isEditing = editProfileId === p.profile_id;
                  return (
                    <div key={p.profile_id} className={`rounded-lg p-3 text-sm border transition ${isEditing ? "bg-violet-100 border-2 border-violet-400" : "bg-white border-slate-200 hover:border-indigo-300"}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-bold">{p.character_name || p.profile_id}</span>
                          <span className="ml-2 text-xs text-slate-500">{p.profile_id}</span>
                          <span className="ml-2 text-xs text-slate-400">{safeRole(p)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleEditProfile(p)} className="text-xs font-bold text-indigo-600 underline">Edit</button>
                          <button className="text-xs font-bold text-red-500 underline" disabled={deleteProfileMut.isPending} onClick={() => { if (deleteProfileMut.isPending) return; if (confirm(`Delete character "${p.character_name || p.profile_id}"? This will also remove references from chapters and scenes.`)) deleteProfileMut.mutate(p.profile_id); }}>Delete</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">No characters created yet. Click Add Character to start.</p>
            )}
          </div>

          {selectedProfile && !editProfileId && (
            <>
              <div className="space-y-3">
                <h3 className="font-black">New Character: {selectedProfile}</h3>
                <ProfileTabs key={`create-${aiApplyCounter}`} resetKey={aiApplyCounter} onDataChange={setProfileData} />
                <Field label="Character name" value={name} onChange={setName} placeholder="Kai" />
                {createProfile.isError && <ErrorBanner error={createProfile.error as Error} />}
                <button className="w-full rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:w-auto sm:rounded-2xl sm:text-base" onClick={handleCreateProfile} disabled={!name || createProfile.isPending}>{createProfile.isPending ? "Creating..." : "Create Profile"}</button>
              </div>
            </>
          )}

          {editProfileId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-black">Editing: {editProfileId}</h3>
                <button onClick={handleCancelEdit} className="text-xs font-bold text-slate-500 underline">Cancel</button>
              </div>
              <AiFillPanel
                page="cast"
                fields={CAST_AI_FIELDS}
                note="AI fills the currently edited character only, using this profile's existing fields plus the whole story context."
                onFieldSelect={setAiFields}
                onGenerate={() => aiGen.mutate()}
                loading={aiGen.isPending}
                results={aiResults}
                onClear={() => setAiResults(null)}
                onApply={handleApplyAi}
                disabled={!editProfileId || !name}
                disabledReason="Open an existing character and keep its name before using AI fill."
                error={aiError}
                onDismissError={() => setAiError(null)}
              />
              <ProfileTabs key={`${editProfileId}-${aiApplyCounter}`} resetKey={`${editProfileId}-${aiApplyCounter}`} onDataChange={setProfileData} initialData={profileData} />
              <Field label="Character name" value={name} onChange={setName} placeholder="Kai" />
              {conflictCheck.data?.has_conflicts && (
                <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-800">⚠️ Conflicts detected:</p>
                  {conflictCheck.data.conflicts.map((c: any, i: number) => (
                    <p key={i} className="text-xs text-amber-700">• {c.message}</p>
                  ))}
                </div>
              )}
              {updateProfile.isError && <ErrorBanner error={updateProfile.error as Error} />}
              <button className="w-full rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:w-auto sm:rounded-2xl sm:text-base" onClick={handleUpdateProfile} disabled={!name || updateProfile.isPending || conflictCheck.isPending}>
                {updateProfile.isPending ? "Updating..." : "Update Profile"}
              </button>
            </div>
          )}

          <div className="rounded-xl border-2 border-slate-900 bg-white p-4 sm:rounded-2xl">
            <h3 className="font-black">Relationship Map</h3>
            <p className="mt-1 text-sm text-slate-600">Locked until at least 2 real major profiles exist.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button className="rounded-xl border-2 border-slate-900 bg-white px-4 py-2.5 text-sm font-black sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base" onClick={() => activate.mutate()} disabled={activate.isPending}>Try Activate</button>
              <span className="text-sm font-bold text-slate-600">Created: <span className="text-amber-700">{created.length}</span></span>
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="characters.json"><StructuredJsonView data={content} /></Panel>
    </div>
  );
}
