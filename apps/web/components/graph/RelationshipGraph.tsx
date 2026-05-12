"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

type GraphNode = { id: string; name: string; class: string; status: string; role: string; faction: string };
type GraphEdge = { id: string; source: string; target: string; type: string; label: string };

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export function RelationshipGraph({ nodes: rawNodes, edges: rawEdges, onSelect }: { nodes: GraphNode[]; edges: GraphEdge[]; onSelect?: (node: GraphNode | null) => void }) {
  const graphData = useMemo(() => {
    const nodes = rawNodes.map((n) => ({
      id: n.id,
      name: n.name,
      val: n.class === "major" || n.class === "main" ? 12 : 7,
      color: n.status === "dead" ? "#94a3b8" : n.class === "major" || n.class === "main" ? "#1e293b" : "#6366f1",
      _role: n.role,
      _faction: n.faction,
    }));
    const links = rawEdges.map((e) => {
      const cm: Record<string, string> = { rival: "#ea580c", enemy: "#dc2626", friend: "#16a34a", ally: "#16a34a", family: "#2563eb", mentor: "#9333ea", love: "#db2777", secret: "#db2777", faction: "#6366f1" };
      return { source: e.source, target: e.target, color: cm[e.type] || "#94a3b8", _label: e.label };
    });
    return { nodes, links };
  }, [rawNodes, rawEdges]);

  if (!graphData.nodes.length) return <p className="text-sm text-slate-400">No characters to visualize.</p>;

  return (
    <div className="w-full rounded-xl border-2 border-slate-200 bg-white overflow-hidden" style={{ height: 500 }}>
      <ForceGraph2D
        graphData={graphData}
        nodeLabel="name"
        nodeColor={(n: any) => n.color}
        nodeVal={(n: any) => n.val}
        linkColor={(l: any) => l.color}
        linkWidth={1.5}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        width={800}
        height={500}
        onNodeClick={(n: any) => {
          const found = rawNodes.find((rn) => rn.id === n.id);
          if (onSelect && found) onSelect(found);
        }}
      />
    </div>
  );
}
