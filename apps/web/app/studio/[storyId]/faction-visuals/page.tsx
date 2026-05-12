"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { AiButton } from "@/components/forms/AiButton";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

type FactionSig = {
  faction_name: string;
  visual_signature: string;
  positive_prompt: string;
  negative_prompt: string;
};

const EMPTY_SIG = (): FactionSig => ({ faction_name: "", visual_signature: "", positive_prompt: "", negative_prompt: "" });

export default function FactionVisualsPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const qc = useQueryClient();

  const msQuery = useQuery({ queryKey: ["master", storyId], queryFn: () => api.getMasterStory(storyId) });
  const content = (msQuery.data?.content || msQuery.data || {}) as any;
  const factionSigs: FactionSig[] = (content?.faction_visual_signatures?.signatures || []);
  const availableFactions: string[] = (content?.major_factions_and_ruling_sides?.selected || []).filter((f: string) => f !== "Custom");

  const [sigs, setSigs] = useState<FactionSig[]>([]);
  const [aiLoading, setAiLoading] = useState<string | null>(null); // faction_name being filled
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (factionSigs.length > 0) {
      setSigs(factionSigs);
    } else if (availableFactions.length > 0 && sigs.length === 0) {
      setSigs(availableFactions.map((name) => ({ ...EMPTY_SIG(), faction_name: name })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msQuery.dataUpdatedAt]);

  const saveMut = useMutation({
    mutationFn: (signatures: FactionSig[]) =>
      api.patchMasterStory(storyId, { target_branch: "faction_visual_signatures.signatures", operation: "replace", value: signatures }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["master", storyId] }),
  });

  function updateSig(idx: number, key: keyof FactionSig, val: string) {
    setSigs((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: val } : s)));
  }

  function addSig() {
    setSigs((prev) => [...prev, EMPTY_SIG()]);
  }

  function removeSig(idx: number) {
    setSigs((prev) => prev.filter((_, i) => i !== idx));
  }

  async function aiFillSig(idx: number, fields: Array<keyof FactionSig>) {
    const sig = sigs[idx];
    setAiLoading(sig.faction_name || String(idx));
    setAiError(null);
    try {
      const res = await api.aiFillField(storyId, {
        page: "faction_visuals",
        target_fields: fields as string[],
        partial_input: sig,
        generation_hints: { faction_name: sig.faction_name },
      });
      const generated = res?.generated || {};
      setSigs((prev) => prev.map((s, i) => (i === idx ? { ...s, ...generated } : s)));
    } catch (e: any) {
      setAiError(e.message || "AI fill failed");
    } finally {
      setAiLoading(null);
    }
  }

  async function aiFillAll() {
    setAiLoading("all");
    setAiError(null);
    try {
      const res = await api.aiFillField(storyId, {
        page: "faction_visuals",
        target_fields: ["signatures"],
        partial_input: { existing_factions: availableFactions, current_signatures: sigs },
      });
      const generated = res?.generated?.signatures;
      if (Array.isArray(generated) && generated.length > 0) {
        setSigs(generated);
      }
    } catch (e: any) {
      setAiError(e.message || "AI fill failed");
    } finally {
      setAiLoading(null);
    }
  }

  const isLoading = aiLoading !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Faction Visuals</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Visual identity per faction — injected into panel AI prompts when characters wear faction gear.
          </p>
        </div>
        <div className="flex gap-2">
          <AiButton label={aiLoading === "all" ? "Generating…" : "⚡ Fill All Factions"} onClick={aiFillAll} loading={aiLoading === "all"} disabled={isLoading} />
          <button onClick={addSig} className="px-3 py-1.5 text-sm rounded bg-zinc-700 hover:bg-zinc-600 text-white">+ Add Faction</button>
        </div>
      </div>

      <ErrorBanner error={aiError} onDismiss={() => setAiError(null)} />

      {availableFactions.length === 0 && (
        <div className="text-zinc-500 text-sm bg-zinc-900 border border-zinc-700 rounded p-3">
          No factions defined yet. Set up factions in <span className="text-blue-400">World Core</span> first, then return here to add their visual identities.
        </div>
      )}

      <div className="space-y-4">
        {sigs.map((sig, idx) => {
          const fillLoading = aiLoading === (sig.faction_name || String(idx));
          return (
            <Panel key={idx} title={sig.faction_name || `Faction ${idx + 1}`}>
              <div className="space-y-3">
                <div className="flex gap-2 items-end">
                  <label className="flex-1 block">
                    <span className="text-xs font-semibold text-zinc-400">Faction name</span>
                    <input
                      className="mt-1 w-full bg-zinc-800 text-white text-sm p-2 rounded border border-zinc-700"
                      value={sig.faction_name}
                      onChange={(e) => updateSig(idx, "faction_name", e.target.value)}
                      placeholder="e.g. Dimensional Purists"
                      list="faction-names"
                    />
                    <datalist id="faction-names">
                      {availableFactions.map((f) => <option key={f} value={f} />)}
                    </datalist>
                  </label>
                  <button onClick={() => removeSig(idx)} className="px-2 py-1.5 text-xs rounded bg-red-900 hover:bg-red-800 text-white mb-0.5">Remove</button>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-zinc-400">Visual signature (prose)</span>
                    <AiButton label="Fill" className="!px-2 !py-1 !text-xs !rounded-lg" onClick={() => aiFillSig(idx, ["visual_signature"])} loading={fillLoading} disabled={isLoading} />
                  </div>
                  <textarea
                    className="w-full bg-zinc-800 text-white text-sm p-2 rounded border border-zinc-700 min-h-[60px]"
                    value={sig.visual_signature}
                    onChange={(e) => updateSig(idx, "visual_signature", e.target.value)}
                    placeholder="e.g. black tactical uniforms, geometric insignia, visor helmets, cold blue lighting"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-zinc-400">AI prompt (positive)</span>
                    <AiButton label="Fill" className="!px-2 !py-1 !text-xs !rounded-lg" onClick={() => aiFillSig(idx, ["positive_prompt"])} loading={fillLoading} disabled={isLoading} />
                  </div>
                  <textarea
                    className="w-full bg-zinc-800 text-white text-xs p-2 rounded border border-zinc-700 min-h-[70px] font-mono"
                    value={sig.positive_prompt}
                    onChange={(e) => updateSig(idx, "positive_prompt", e.target.value)}
                    placeholder="Diffusion-ready prompt for faction uniform / gear…"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-zinc-400">AI prompt (negative)</span>
                    <AiButton label="Fill" className="!px-2 !py-1 !text-xs !rounded-lg" onClick={() => aiFillSig(idx, ["negative_prompt"])} loading={fillLoading} disabled={isLoading} />
                  </div>
                  <textarea
                    className="w-full bg-zinc-800 text-white text-xs p-2 rounded border border-zinc-700 min-h-[40px] font-mono"
                    value={sig.negative_prompt}
                    onChange={(e) => updateSig(idx, "negative_prompt", e.target.value)}
                    placeholder="What to exclude…"
                  />
                </div>

                <AiButton
                  label={fillLoading ? "Generating…" : "⚡ Fill All Fields"}
                  className="!px-3 !py-1.5 !text-xs !rounded-lg"
                  onClick={() => aiFillSig(idx, ["visual_signature", "positive_prompt", "negative_prompt"])}
                  loading={fillLoading}
                  disabled={isLoading}
                />
              </div>
            </Panel>
          );
        })}
      </div>

      {sigs.length > 0 && (
        <div className="flex gap-3 pt-2">
          <button
            onClick={() => saveMut.mutate(sigs)}
            disabled={saveMut.isPending}
            className="px-5 py-2 text-sm rounded bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
          >
            {saveMut.isPending ? "Saving…" : "Save All Faction Visuals"}
          </button>
        </div>
      )}
    </div>
  );
}
