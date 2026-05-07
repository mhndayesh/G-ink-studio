"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "@/lib/api";

export default function RootPage() {
  const stories = useQuery({ queryKey: ["stories"], queryFn: () => api.getStories(), staleTime: 30000 });

  return (
    <main className="min-h-screen paper-grid px-4 py-8 sm:px-6 sm:py-12">
      <section className="mx-auto max-w-4xl manga-panel rounded-xl p-5 sm:rounded-studio sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700 sm:text-sm sm:tracking-[0.28em]">Manga Maker System</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:mt-3 sm:text-5xl">Manga Studio Flow</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-700 sm:mt-4 sm:text-base">A dynamic frontend for the story-state backend: story setup, cast forge, plot board, writing desk, consequence court, manga script, memory timeline, and continuity radar.</p>
        <div className="mt-6 flex flex-col gap-3 sm:mt-8">
          <Link className="flex w-full justify-center rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:w-fit sm:rounded-2xl sm:text-base" href="/studio">Open Studio</Link>
          {stories.isLoading ? (
            <span className="text-sm text-slate-400">Loading stories...</span>
          ) : stories.isError ? (
            <span className="text-sm text-red-500">Failed to load stories</span>
          ) : Array.isArray(stories.data) && stories.data.length > 0 ? (
            <div className="grid max-h-80 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
              {stories.data.map((s: any) => (
                <Link key={s.story_id ?? s.id} className="min-w-0 rounded-xl border-2 border-slate-900 bg-white px-4 py-3 text-sm font-black leading-snug sm:rounded-2xl sm:text-base" href={`/studio/${s.story_id ?? s.id}/home`}>
                  <span className="block truncate">Open {s.title ?? s.story_id ?? s.id}</span>
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-sm text-slate-400">No stories yet. Create one in the Studio.</span>
          )}
        </div>
      </section>
    </main>
  );
}
