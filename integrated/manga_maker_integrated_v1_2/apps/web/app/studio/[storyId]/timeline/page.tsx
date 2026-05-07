"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";

export default function TimelinePage() {
  const { storyId } = useParams<{ storyId: string }>();
  const versions = useQuery({ queryKey: ["versions", storyId], queryFn: () => api.listVersions(storyId) });
  const items = versions.data?.versions || versions.data || [];
  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_1fr]">
      <Panel title="Memory Timeline" subtitle="Versioned story memory. Old versions are frozen.">
        <div className="space-y-2 sm:space-y-3">
          {versions.isLoading ? (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-bold text-slate-500">Loading versions...</p>
            </div>
          ) : Array.isArray(items) && items.length ? items.map((v: any, index: number) => (
            <div key={v.version_id || index} className="rounded-xl border-2 border-slate-900 bg-white p-3 sm:rounded-2xl sm:p-4">
              <div className="text-[10px] font-black text-amber-700 sm:text-xs">VERSION</div>
              <div className="text-lg font-black sm:text-xl">{v.version_id || JSON.stringify(v)}</div>
              <div className="text-xs text-slate-600 sm:text-sm">{v.status}</div>
            </div>
          )) : (
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
              <p className="text-sm font-bold text-slate-500">No versions loaded yet.</p>
            </div>
          )}
        </div>
      </Panel>
      <Panel title="Raw Versions"><StructuredJsonView data={versions.data || {}} /></Panel>
    </div>
  );
}
