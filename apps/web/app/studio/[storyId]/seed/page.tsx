"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getExpansionText } from "@/lib/aiResults";
import { useHydrateOnce } from "@/lib/hooks/useHydrate";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { OptionGrid } from "@/components/forms/OptionGrid";
import { AiButton } from "@/components/forms/AiButton";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

export default function SeedPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const master = useQuery({ queryKey: ["master", storyId], queryFn: () => api.getMasterStory(storyId) });
  const content = useMemo(() => (master.data?.content || master.data || {}) as any, [master.data]);
  const [idea, setIdea] = useState("");
  const [ending, setEnding] = useState("");
  const [foundation, setFoundation] = useState("");
  const [types, setTypes] = useState<string[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<any>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const patch = useMutation({ mutationFn: (body: any) => api.patchMasterStory(storyId, body), onSuccess: () => master.refetch() });
  const aiExpand = useMutation({
    mutationFn: () => api.aiComplete(storyId, { expansion_mode: "Light Expansion", text: idea }),
    onSuccess: (data) => {
      if (!getExpansionText(data)) {
        setAiSuggestion(null);
        setAiError(AI_EMPTY_MESSAGE);
        return;
      }
      setAiError(null);
      setAiSuggestion(data);
    },
    onError: (err: any) => {
      setAiError(err?.message || "AI request failed");
      setTimeout(() => setAiError(null), 6000);
    },
  });

  // Hydrate from saved master_story.json exactly once per story.
  // The previous useEffect bailed out early when idea_so_far was empty
  // (so seeds set only via story_type were lost) and only watched a single
  // field, so refetches did not re-sync.
  useHydrateOnce(!!master.data, storyId, () => {
    const m = (master.data?.content || master.data || {}) as any;
    if (m.idea_so_far) setIdea(m.idea_so_far);
    const t = m.story_type?.selected;
    if (Array.isArray(t)) setTypes(t);
    else if (typeof t === "string" && t) setTypes([t]);
    if (m.ending_direction?.selected) setEnding(m.ending_direction.selected);
    if (m.story_foundation?.selected) setFoundation(m.story_foundation.selected);
  });

  const storyTypes = useMemo(() => content.story_type?.options || [], [content]);
  const endingOptions = content.ending_direction?.options || [];
  const foundationOptions = content.story_foundation?.options || [];

  const [aiFillLoading, setAiFillLoading] = useState(false);
  const [aiFillError, setAiFillError] = useState<string | null>(null);
  const [aiFillApplied, setAiFillApplied] = useState(false);

  async function aiFillAll() {
    setAiFillLoading(true);
    setAiFillError(null);
    try {
      const res = await api.aiFillField(storyId, {
        page: "seed",
        target_fields: ["idea_so_far", "story_type", "ending_direction", "story_foundation"],
        partial_input: {
          idea_so_far: idea,
          available_story_types: storyTypes,
          available_endings: endingOptions,
          available_foundations: foundationOptions,
        },
      });
      const g = res?.generated || {};
      if (g.idea_so_far && typeof g.idea_so_far === "string") setIdea(g.idea_so_far);
      const stSel = g.story_type?.selected;
      if (Array.isArray(stSel)) {
        const valid = stSel.filter((v: string) => storyTypes.includes(v));
        if (valid.length) setTypes(valid);
      }
      const endSel = g.ending_direction?.selected ?? g.ending_direction;
      if (typeof endSel === "string" && endingOptions.includes(endSel)) setEnding(endSel);
      const foundSel = g.story_foundation?.selected ?? g.story_foundation;
      if (typeof foundSel === "string" && foundationOptions.includes(foundSel)) setFoundation(foundSel);
      setAiFillApplied(true);
      setTimeout(() => setAiFillApplied(false), 4000);
    } catch (e: any) {
      setAiFillError(e?.message || "AI fill failed");
    } finally {
      setAiFillLoading(false);
    }
  }

  function toggleType(value: string) { setTypes((old) => old.includes(value) ? old.filter((x) => x !== value) : [...old, value]); }
  async function saveSeed() {
    if (idea) await patch.mutateAsync({ target_branch: "idea_so_far", operation: "replace", value: idea });
    if (types.length) await patch.mutateAsync({ target_branch: "story_type.selected", operation: "replace", value: types });
    if (ending) await patch.mutateAsync({ target_branch: "ending_direction.selected", operation: "replace", value: ending });
    if (foundation) await patch.mutateAsync({ target_branch: "story_foundation.selected", operation: "replace", value: foundation });
  }

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Story Seed" subtitle="Title/idea/genre/foundation. This safely patches master_story.json while it is template_state.">
        <div className="space-y-5">
          <Field label="Basic idea" value={idea} onChange={setIdea} textarea placeholder="Write the simple manga idea, not the full story." />

          <div className="flex flex-wrap gap-2">
            <AiButton
              label="AI Suggest Ideas"
              onClick={() => aiExpand.mutate()}
              loading={aiExpand.isPending}
              disabled={!idea || aiFillLoading}
              variant="secondary"
            />
            <AiButton
              label={aiFillLoading ? "Filling…" : "⚡ AI Fill All (idea + selections)"}
              onClick={aiFillAll}
              loading={aiFillLoading}
              disabled={aiFillLoading || aiExpand.isPending}
            />
          </div>

          {aiFillError && <ErrorBanner error={aiFillError} onDismiss={() => setAiFillError(null)} />}
          {aiFillApplied && (
            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-2 text-xs font-black text-emerald-700">
              ✓ AI filled selections and idea — review and edit above, then Save.
            </div>
          )}
          {aiError && <ErrorBanner error={aiError} onDismiss={() => setAiError(null)} />}
          {patch.isError && <ErrorBanner error={patch.error as Error} />}

          {aiSuggestion && (
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4">
              <h3 className="text-sm font-black text-violet-800">✨ AI Suggestion</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{getExpansionText(aiSuggestion)}</p>
              <button className="mt-2 text-sm font-bold text-violet-600 underline" onClick={() => { setIdea(getExpansionText(aiSuggestion) || idea); setAiSuggestion(null); }}>Use this idea</button>
            </div>
          )}

          <div><h3 className="mb-2 font-black">Story type</h3><OptionGrid options={storyTypes} selected={types} onSelect={toggleType} multi /></div>
          <div><h3 className="mb-2 font-black">Ending direction</h3><OptionGrid options={endingOptions} selected={ending} onSelect={setEnding} /></div>
          <div><h3 className="mb-2 font-black">Story foundation</h3><OptionGrid options={foundationOptions} selected={foundation} onSelect={setFoundation} /></div>
          <button
            className="w-full rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:w-auto sm:rounded-2xl sm:text-base"
            onClick={saveSeed}
            disabled={patch.isPending}
          >
            Save Story Seed
          </button>
        </div>
      </Panel>
      <Panel title="master_story.json"><StructuredJsonView data={content} /></Panel>
    </div>
  );
}
