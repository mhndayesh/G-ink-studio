"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Field } from "@/components/forms/Field";
import { Panel } from "@/components/cards/Panel";

function formatDate(isoString: string): string {
  if (!isoString) return "—";
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function PhaseBadge({ phase }: { phase: string | undefined }) {
  const colorMap: Record<string, string> = {
    incomplete: "bg-gray-100 text-gray-700 border-gray-300",
    in_progress: "bg-blue-50 text-blue-700 border-blue-300",
    not_started: "bg-slate-50 text-slate-500 border-slate-200",
    draft: "bg-purple-50 text-purple-700 border-purple-300",
  };
  const cls = colorMap[phase || ""] || colorMap.not_started;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {(phase || "not_started").replace("_", " ")}
    </span>
  );
}

function StoryCard({ story, onOpen, onDelete }: { story: any; onOpen: () => void; onDelete: () => void }) {
  const phases = [
    { key: "master_story", label: "Master" },
    { key: "characters", label: "Cast" },
    { key: "plot_outline", label: "Plot" },
    { key: "chapter_script", label: "Script" },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      aria-label={`Open ${story.title}`}
      className="group cursor-pointer rounded-xl border-2 border-slate-900 bg-white p-4 transition-all hover:-translate-y-0.5 hover:shadow-[6px_6px_0_#111827] sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-black tracking-tight sm:text-xl">{story.title}</h3>
          <p className="mt-0.5 text-xs font-mono text-slate-500">{story.story_id} · v{story.current_version_id.replace("version_", "")}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
          story.state_type === "template_state" ? "bg-green-50 text-green-700 border-green-300" : "bg-slate-50 text-slate-600 border-slate-300"
        }`}>
          {story.state_type === "template_state" ? "New" : "Active"}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {phases.map((p) => (
          <PhaseBadge key={p.key} phase={story.phase_status?.[p.key]} />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-slate-500">Created {formatDate(story.created_at)}</p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="shrink-0 rounded-lg border-2 border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-600 opacity-40 transition-all hover:border-red-500 hover:bg-red-50 hover:opacity-100 sm:px-4"
          title="Delete this story"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border-2 border-slate-900 bg-white p-4 sm:p-5">
          <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-100" />
          <div className="mt-4 flex gap-2">
            {[1, 2, 3, 4].map((j) => (
              <div key={j} className="h-5 w-16 animate-pulse rounded-full bg-slate-100" />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export default function StudioPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: stories = [], isLoading } = useQuery({
    queryKey: ["stories"],
    queryFn: () => api.getStories(),
  });

  const create = useMutation({
    mutationFn: (t: string) => api.createStory(t),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      router.push(`/studio/${data.story_id || "story_001"}/home`);
    },
  });

  const remove = useMutation({
    mutationFn: (storyId: string) => api.deleteStory(storyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stories"] });
      setDeleteConfirm(null);
    },
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    create.mutate(title.trim());
  };

  const confirmDelete = (storyId: string) => {
    if (deleteConfirm === storyId) {
      remove.mutate(storyId);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(storyId);
    }
  };

  return (
    <main className="min-h-screen paper-grid px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Manga Maker Studio</h1>
          <p className="mt-2 text-sm text-slate-600">Create a new story or open an existing one to continue working.</p>
        </div>

        {/* Create Story */}
        <Panel title="New Story" subtitle="Enter a title and create a fresh story with v001 template files.">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Story Title" value={title} onChange={setTitle} placeholder="My Manga Story" onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleCreate(); }} />
            <button
              className="whitespace-nowrap rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white transition-all hover:bg-slate-800 sm:rounded-2xl sm:text-base"
              onClick={handleCreate}
              disabled={create.isPending || !title.trim()}
            >
              {create.isPending ? "Creating..." : "Create Story"}
            </button>
          </div>
          {create.error && <p className="mt-3 rounded-xl bg-red-100 p-3 text-sm font-bold text-red-800">{(create.error as Error).message}</p>}
        </Panel>

        {/* Existing Stories */}
        <Panel title={`Your Stories (${stories.length})`} subtitle="Click any story to open it. Click Delete to remove.">
          {isLoading ? (
            <LoadingSkeleton />
          ) : stories.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm font-semibold text-slate-500">No stories yet</p>
              <p className="mt-1 text-xs text-slate-400">Create your first story above to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {stories.map((story: any) => (
                <StoryCard
                  key={story.story_id}
                  story={story}
                  onOpen={() => router.push(`/studio/${story.story_id}/home`)}
                  onDelete={() => confirmDelete(story.story_id)}
                />
              ))}
            </div>
          )}
          {remove.error && (
            <p className="mt-3 rounded-xl bg-red-100 p-3 text-sm font-bold text-red-800">{(remove.error as Error).message}</p>
          )}
        </Panel>

        {/* Delete confirmation toast */}
        {deleteConfirm && (
          <div className="fixed bottom-6 right-6 z-50 rounded-xl border-2 border-red-400 bg-white p-4 shadow-[6px_6px_0_#111827] sm:p-5">
            <p className="text-sm font-bold text-slate-900">Delete this story?</p>
            <p className="mt-1 text-xs text-slate-600">Click Delete again to confirm, or wait 3 seconds.</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border-2 border-slate-900 bg-white px-4 py-2 text-xs font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
