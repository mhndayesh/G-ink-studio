"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { AiButton } from "@/components/forms/AiButton";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

type Location = {
  location_id: string;
  name: string;
  type: string;
  description: string;
  positive_prompt: string;
  negative_prompt: string;
  used_in_chapters: string[];
};

const EMPTY_LOC = (): Omit<Location, "location_id"> => ({
  name: "",
  type: "",
  description: "",
  positive_prompt: "",
  negative_prompt: "",
  used_in_chapters: [],
});

const AI_FIELDS = ["description", "positive_prompt", "negative_prompt"];

export default function LocationsPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const qc = useQueryClient();

  const locsQuery = useQuery({
    queryKey: ["locations", storyId],
    queryFn: () => api.listLocations(storyId),
  });

  const [editing, setEditing] = useState<Location | null>(null);
  const [draft, setDraft] = useState<Omit<Location, "location_id">>(EMPTY_LOC());
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  function invalidateStatus() {
    qc.invalidateQueries({ queryKey: ["status", storyId] });
  }

  const createMut = useMutation({
    mutationFn: (body: any) => api.createLocation(storyId, body),
    onSuccess: (created: any) => {
      qc.invalidateQueries({ queryKey: ["locations", storyId] });
      invalidateStatus();
      if (created?.location_id) {
        setEditing(created as Location);
        setDraft({ name: created.name, type: created.type, description: created.description, positive_prompt: created.positive_prompt, negative_prompt: created.negative_prompt, used_in_chapters: created.used_in_chapters || [] });
      } else {
        resetForm();
      }
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.updateLocation(storyId, id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations", storyId] }); invalidateStatus(); resetForm(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteLocation(storyId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations", storyId] }); invalidateStatus(); },
  });

  const genAllMut = useMutation({
    mutationFn: () => api.aiGenerateAllLocations(storyId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations", storyId] }); invalidateStatus(); },
  });

  function resetForm() {
    setEditing(null);
    setDraft(EMPTY_LOC());
  }

  function startEdit(loc: Location) {
    setEditing(loc);
    setDraft({ name: loc.name, type: loc.type, description: loc.description, positive_prompt: loc.positive_prompt, negative_prompt: loc.negative_prompt, used_in_chapters: loc.used_in_chapters });
  }

  function save() {
    if (editing) {
      updateMut.mutate({ id: editing.location_id, body: draft });
    } else {
      createMut.mutate(draft);
    }
  }

  async function aiFillFields(fieldKeys: string[]) {
    setAiLoading(true);
    setAiError(null);
    try {
      let loc = editing;
      if (!loc) {
        // Auto-create a blank location first, then AI-fill it
        const created = await api.createLocation(storyId, { ...draft, name: draft.name || "New Location" }) as any;
        await qc.invalidateQueries({ queryKey: ["locations", storyId] });
        if (!created?.location_id) throw new Error("Failed to create location");
        loc = created as Location;
        setEditing(loc);
        setDraft((d) => ({ ...d, name: loc!.name }));
      }
      const res = await api.aiFillLocation(storyId, loc.location_id, {
        target_fields: fieldKeys,
        partial_input: { ...draft, name: loc.name },
      }) as any;
      const generated = res?.generated || {};
      setDraft((prev) => ({ ...prev, ...generated }));
    } catch (e: any) {
      setAiError(e.message || "AI fill failed");
    } finally {
      setAiLoading(false);
    }
  }

  const locations: Location[] = (locsQuery.data as any) || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Locations</h1>
          <p className="text-sm text-zinc-400 mt-1">Named locations with AI background prompts for consistent panel generation.</p>
        </div>
        <div className="flex gap-2">
          <AiButton
            label={genAllMut.isPending ? "Generating…" : "⚡ Generate All Locations"}
            onClick={() => genAllMut.mutate()}
            loading={genAllMut.isPending}
            disabled={genAllMut.isPending}
          />
          <button
            onClick={resetForm}
            className="px-3 py-1.5 text-sm rounded bg-zinc-700 hover:bg-zinc-600 text-white"
          >
            + New Location
          </button>
        </div>
      </div>

      {aiError && <ErrorBanner error={new Error(aiError)} onDismiss={() => setAiError(null)} />}
      {genAllMut.isError && <ErrorBanner error={genAllMut.error as Error} onDismiss={() => genAllMut.reset()} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Location list */}
        <div className="space-y-2">
          {locsQuery.isLoading && <p className="text-zinc-500 text-sm">Loading…</p>}
          {!locsQuery.isLoading && locations.length === 0 && (
            <p className="text-zinc-500 text-sm">No locations yet. Create one or use ⚡ Generate All.</p>
          )}
          {locations.map((loc) => (
            <div
              key={loc.location_id}
              className={`p-3 rounded border cursor-pointer text-sm ${editing?.location_id === loc.location_id ? "border-blue-500 bg-zinc-800" : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"}`}
              onClick={() => startEdit(loc)}
            >
              <div className="font-medium text-white">{loc.name || <span className="text-zinc-500 italic">Unnamed</span>}</div>
              {loc.type && <div className="text-zinc-400 text-xs mt-0.5">{loc.type}</div>}
              {loc.description && <div className="text-zinc-500 text-xs mt-1 line-clamp-2">{loc.description}</div>}
            </div>
          ))}
        </div>

        {/* Edit / Create form */}
        <div className="lg:col-span-2 space-y-4">
          <Panel title={editing ? `Edit: ${editing.name || "Location"}` : "New Location"}>
            <div className="space-y-3">
              {!editing && (
                <p className="text-xs text-zinc-400 border border-zinc-700 rounded px-3 py-2 bg-zinc-900">
                  Enter a name and click <strong className="text-white">AI Generate All Fields</strong> to auto-fill everything — or fill manually and click <strong className="text-white">Create Location</strong>.
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-400">Name</span>
                  <input
                    className="mt-1 w-full bg-zinc-800 text-white text-sm p-2 rounded border border-zinc-700"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Kinji's Apartment"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-400">Type</span>
                  <input
                    className="mt-1 w-full bg-zinc-800 text-white text-sm p-2 rounded border border-zinc-700"
                    value={draft.type}
                    onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                    placeholder="e.g. Interior / Residential"
                  />
                </label>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-zinc-400">Description</span>
                  <AiButton label="Fill" className="!px-2 !py-1 !text-xs !rounded-lg" onClick={() => aiFillFields(["description"])} loading={aiLoading} disabled={aiLoading} />
                </div>
                <textarea
                  className="w-full bg-zinc-800 text-white text-sm p-2 rounded border border-zinc-700 min-h-[70px]"
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Visual description of this location…"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-zinc-400">AI prompt (positive)</span>
                  <AiButton label="Fill" className="!px-2 !py-1 !text-xs !rounded-lg" onClick={() => aiFillFields(["positive_prompt"])} loading={aiLoading} disabled={aiLoading} />
                </div>
                <textarea
                  className="w-full bg-zinc-800 text-white text-xs p-2 rounded border border-zinc-700 min-h-[80px] font-mono"
                  value={draft.positive_prompt}
                  onChange={(e) => setDraft((d) => ({ ...d, positive_prompt: e.target.value }))}
                  placeholder="Diffusion prompt for background generation…"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-zinc-400">AI prompt (negative)</span>
                  <AiButton label="Fill" className="!px-2 !py-1 !text-xs !rounded-lg" onClick={() => aiFillFields(["negative_prompt"])} loading={aiLoading} disabled={aiLoading} />
                </div>
                <textarea
                  className="w-full bg-zinc-800 text-white text-xs p-2 rounded border border-zinc-700 min-h-[50px] font-mono"
                  value={draft.negative_prompt}
                  onChange={(e) => setDraft((d) => ({ ...d, negative_prompt: e.target.value }))}
                  placeholder="What to exclude from background generation…"
                />
              </div>

              {/* AI Fill All — always shown */}
              <div className="flex gap-2 pt-1">
                <AiButton
                  label={aiLoading ? "Generating…" : editing ? "⚡ Fill All AI Fields" : "⚡ AI Generate All Fields"}
                  onClick={() => aiFillFields(AI_FIELDS)}
                  loading={aiLoading}
                  disabled={aiLoading}
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-zinc-800">
                <button
                  onClick={save}
                  disabled={createMut.isPending || updateMut.isPending || aiLoading}
                  className="px-4 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                >
                  {editing ? "Save Changes" : "Create Location"}
                </button>
                {editing && (
                  <>
                    <button onClick={resetForm} className="px-3 py-1.5 text-sm rounded bg-zinc-700 hover:bg-zinc-600 text-white">
                      Cancel
                    </button>
                    <button
                      onClick={() => { deleteMut.mutate(editing.location_id); resetForm(); }}
                      className="px-3 py-1.5 text-sm rounded bg-red-900 hover:bg-red-800 text-white ml-auto"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
