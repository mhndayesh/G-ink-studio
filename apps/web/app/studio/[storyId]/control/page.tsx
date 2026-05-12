"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";

function isEmpty(obj: any) {
  return !obj || (typeof obj === "object" && Object.keys(obj).length === 0);
}

export default function ControlPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api.me() });
  const status = useQuery({ queryKey: ["status", storyId], queryFn: () => api.storyStatus(storyId) });
  const files = useQuery({ queryKey: ["files", storyId], queryFn: () => api.currentFiles(storyId) });
  const graphStatus = useQuery({ queryKey: ["graphStatus", storyId], queryFn: () => api.getGraphStatus(storyId) });
  const vectorStatus = useQuery({ queryKey: ["vectorStatus", storyId], queryFn: () => api.getVectorStatus(storyId) });
  const llmRuns = useQuery({ queryKey: ["llmRuns", storyId], queryFn: () => api.listLlmRuns(storyId) });
  const events = useQuery({ queryKey: ["events", storyId], queryFn: () => api.getEvents(storyId) });
  const patches = useQuery({ queryKey: ["patches", storyId], queryFn: () => api.getPatches(storyId) });
  const dbInfo = useQuery({ queryKey: ["dbInfo"], queryFn: () => api.getDbInfo() });

  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
      <Panel title="Auth">
        {isEmpty(me.data) && !me.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">Not authenticated. Check API key configuration.</div>
        ) : (
          <StructuredJsonView data={me.data || {}} />
        )}
      </Panel>
      <Panel title="Story Status">
        {isEmpty(status.data) && !status.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">No story status loaded. Ensure the backend is running.</div>
        ) : (
          <StructuredJsonView data={status.data || {}} />
        )}
      </Panel>
      <Panel title="Current Files">
        {isEmpty(files.data) && !files.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">No file information available. Create or reload the story.</div>
        ) : (
          <StructuredJsonView data={files.data || {}} />
        )}
      </Panel>
      <Panel title="Graph (Neo4j)">
        {graphStatus.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">Checking graph connection...</div>
        ) : (
          <StructuredJsonView data={graphStatus.data || {}} />
        )}
      </Panel>
      <Panel title="Vector (Qdrant)">
        {vectorStatus.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">Checking vector connection...</div>
        ) : (
          <StructuredJsonView data={vectorStatus.data || {}} />
        )}
      </Panel>
      <Panel title="DB Migration Info">
        {dbInfo.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">Loading DB info...</div>
        ) : (
          <StructuredJsonView data={dbInfo.data || {}} />
        )}
      </Panel>
      <Panel title="Story Events">
        {events.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">Loading events...</div>
        ) : (
          <StructuredJsonView data={events.data || {}} />
        )}
      </Panel>
      <Panel title="JSON Patches">
        {patches.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">Loading patches...</div>
        ) : (
          <StructuredJsonView data={patches.data || {}} />
        )}
      </Panel>
      <Panel title="LLM Run History">
        {llmRuns.isLoading ? (
          <div className="text-sm text-slate-400 font-bold">Loading LLM runs...</div>
        ) : (
          <StructuredJsonView data={llmRuns.data || {}} />
        )}
      </Panel>
    </div>
  );
}
