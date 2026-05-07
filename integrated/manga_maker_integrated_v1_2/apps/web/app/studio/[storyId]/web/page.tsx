"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { JsonPreview } from "@/components/cards/JsonPreview";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { RelationshipGraph } from "@/components/graph/RelationshipGraph";

export default function WebPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const [selectedNode, setSelectedNode] = useState<any>(null);
  const [relProposals, setRelProposals] = useState<any[] | null>(null);
  const chars = useQuery({ queryKey: ["characters", storyId], queryFn: () => api.getCharacters(storyId) });
  const content = (chars.data?.content || chars.data || {}) as any;
  const majorProfiles = content.created_major_character_profiles || [];
  const sideProfiles = content.created_side_character_profiles || [];
  const relMap = content.character_relationship_map || {};
  const totalNodes = majorProfiles.length + sideProfiles.length;
  const locked = majorProfiles.length < 2;

  const analyzeRels = useMutation({ mutationFn: () => api.analyzeRelationships(storyId), onSuccess: (d: any) => { setRelProposals(d?.proposed_relationships || []); } });
  const applyRels = useMutation({ mutationFn: (rels: any[]) => api.applyRelationships(storyId, rels), onSuccess: () => { setRelProposals([]); chars.refetch(); } });

  // Build nodes and edges from JSON data
  const nodes = [
    ...majorProfiles.map((p: any) => ({ id: p.profile_id, name: p.character_name || p.profile_id, class: "major", status: p.status?.selected || "alive", role: p.character_role_level?.selected || "", faction: (p.main_character_faction_alignment?.alignment_details?.linked_master_faction || "") })),
    ...sideProfiles.map((p: any, i: number) => ({ id: p.profile_id || `side_${i}`, name: p.character_name || "Side", class: "side", status: p.status?.selected || "alive", role: p.character_role_level?.selected || "", faction: "" })),
  ];
  const findProfileByName = (name: string) => {
    const allProfiles = [...majorProfiles, ...sideProfiles];
    const exact = allProfiles.find((p: any) => p.character_name === name);
    if (exact) return exact;
    const caseInsensitive = allProfiles.find((p: any) => (p.character_name || "").toLowerCase() === name.toLowerCase());
    return caseInsensitive || null;
  };
  const edges = (relMap.relationships || [])
    .map((r: any, i: number) => {
      const parts = (r.characters_involved || "?/?").split("/").map((s: string) => s.trim()).filter(Boolean);
      if (parts.length < 2) return null;
      const srcNode = findProfileByName(parts[0]);
      const tgtNode = findProfileByName(parts[1]);
      if (!srcNode || !tgtNode) return null;
      return { id: `rel_${i}`, source: srcNode.profile_id, target: tgtNode.profile_id, type: (r.relationship_change_type || "friend").toLowerCase().replace(/\s+/g, "_"), label: r.relationship_change_type || "" };
    })
    .filter(Boolean) as any[];

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Relationship Web" subtitle={locked ? "Locked — create 2+ major profiles first" : "Visual relationship map"}>
        {locked ? (
          <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-6 text-center">
            <div className="text-3xl mb-2">&#128274;</div>
            <p className="font-bold text-amber-800">Relationship web is locked</p>
            <p className="mt-1 text-sm text-amber-700">Create at least 2 major character profiles in Cast Forge to unlock the relationship map.</p>
            <p className="mt-3 text-xs text-amber-600">Major profiles: {majorProfiles.length} | Side characters: {sideProfiles.length} | Total nodes: {totalNodes}</p>
          </div>
        ) : nodes.length > 1 ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2">
              <button className="rounded-xl border-2 border-pink-400 bg-white px-3 py-1.5 text-xs font-bold text-pink-600" onClick={() => analyzeRels.mutate()} disabled={analyzeRels.isPending}>
                {analyzeRels.isPending ? "Analyzing..." : "Regenerate Relationship Map"}
              </button>
              {analyzeRels.isError && <ErrorBanner error={analyzeRels.error as Error} />}
              {relProposals !== null && relProposals.length === 0 && !analyzeRels.isPending && (
                <span className="text-xs font-bold text-slate-500 self-center">No new relationships.</span>
              )}
              {relProposals && relProposals.length > 0 && (
                <button className="rounded-xl border-2 border-pink-600 bg-pink-600 px-3 py-1.5 text-xs font-bold text-white" onClick={() => applyRels.mutate(relProposals)} disabled={applyRels.isPending}>
                  {applyRels.isPending ? "Applying..." : `Apply ${relProposals.length}`}
                </button>
              )}
            </div>
            {relProposals && relProposals.length > 0 && (
              <div className="mb-3 space-y-1 max-h-32 overflow-y-auto">
                {relProposals.map((r: any, i: number) => (
                  <div key={i} className="rounded-lg border border-pink-200 bg-white p-2 text-xs">
                    <span className="font-bold">{r.characters_involved || "?"}</span>
                    <span className="ml-2 rounded bg-pink-100 px-1.5 py-0.5 font-bold text-pink-700">{r.relationship_change_type || "neutral"}</span>
                  </div>
                ))}
              </div>
            )}
            <RelationshipGraph nodes={nodes} edges={edges} onSelect={setSelectedNode} />
            {selectedNode && (
              <div className="mt-3 rounded-xl border-2 border-indigo-200 bg-indigo-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-black">{selectedNode.name}</h3>
                  <span className="text-xs font-bold text-slate-500">{selectedNode.class === "major" ? "Major" : "Side"}</span>
                </div>
                <div className="mt-1 text-xs text-slate-600">{selectedNode.role}{selectedNode.faction ? ` — ${selectedNode.faction}` : ""}</div>
                <div className="mt-1 text-[10px] text-slate-400">Status: {selectedNode.status}</div>
                <button className="mt-2 text-xs font-bold text-indigo-600 underline" onClick={() => setSelectedNode(null)}>Close</button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">Add characters to see the relationship graph.</p>
        )}
      </Panel>
      <Panel title="Relationship Map State">
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-md bg-slate-900 px-2 py-1 font-bold text-white">Major: {majorProfiles.length}</span>
          <span className="rounded-md bg-indigo-600 px-2 py-1 font-bold text-white">Side: {sideProfiles.length}</span>
          <span className={`rounded-md px-2 py-1 font-bold text-white ${relMap.is_enabled ? "bg-emerald-600" : "bg-slate-400"}`}>{relMap.is_enabled ? "Map Active" : "Map Locked"}</span>
        </div>
        <JsonPreview data={{ nodes, edges }} />
      </Panel>
    </div>
  );
}
