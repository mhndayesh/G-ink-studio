"use client";

import type React from "react";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Archive, CheckCircle, Download, FileText, Image as ImageIcon, Layers, Loader2 } from "lucide-react";
import { api, exportApi, triggerBlobDownload } from "@/lib/api";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

type DownloadState = "idle" | "loading" | "done" | "error";

interface DownloadButtonProps {
  label: string;
  ext: string;
  onDownload: () => Promise<void>;
  disabled?: boolean;
}

function DownloadButton({ label, ext, onDownload, disabled }: DownloadButtonProps) {
  const [state, setState] = useState<DownloadState>("idle");

  async function handle() {
    setState("loading");
    try {
      await onDownload();
      setState("done");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  const base = "inline-flex items-center gap-1.5 rounded-xl border-2 px-3 py-2 text-sm font-bold transition";
  const styles: Record<DownloadState, string> = {
    idle: "border-slate-900 bg-white hover:bg-slate-50 cursor-pointer",
    loading: "border-slate-300 bg-slate-100 text-slate-500 cursor-not-allowed",
    done: "border-emerald-500 bg-emerald-50 text-emerald-700",
    error: "border-red-500 bg-red-50 text-red-700",
  };

  return (
    <button className={`${base} ${styles[state]}`} onClick={handle} disabled={disabled || state === "loading"}>
      {state === "loading" && <Loader2 size={14} className="animate-spin" />}
      {state === "done" && <CheckCircle size={14} />}
      {state === "error" && <AlertCircle size={14} />}
      {state === "idle" && <Download size={14} />}
      <span className="text-[11px] uppercase tracking-wide">
        {state === "done" ? "Saved" : state === "error" ? "Failed" : ext}
      </span>
      {state === "idle" && <span className="font-normal text-slate-500">{label}</span>}
    </button>
  );
}

interface ExportCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  children: React.ReactNode;
}

function ExportCard({ icon, title, description, color, children }: ExportCardProps) {
  return (
    <div className={`rounded-2xl border-2 border-slate-900 bg-white p-5 shadow-[3px_3px_0_0_#1e293b] ${color}`}>
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div>
          <div className="text-base font-black">{title}</div>
          <div className="mt-0.5 text-xs text-slate-500">{description}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export default function ExportPage() {
  const { storyId } = useParams<{ storyId: string }>();

  const storyData = useQuery({
    queryKey: ["masterStory", storyId],
    queryFn: () => api.getMasterStory(storyId),
  });

  const script = useQuery({
    queryKey: ["chapterScript", storyId],
    queryFn: () => api.getChapterScript(storyId),
  });

  const scriptContent = (script.data?.content || script.data || {}) as { pages?: unknown[] };
  const hasScriptData = !!scriptContent.pages?.length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border-2 border-slate-900 bg-slate-900 p-5 text-white shadow-[3px_3px_0_0_#0f172a]">
        <div className="flex items-center gap-3">
          <Archive size={22} />
          <div>
            <div className="text-lg font-black">Export Studio</div>
            <div className="mt-0.5 text-sm text-slate-400">
              Download your story as polished text, scene breakdowns, visual references, or a raw data archive.
            </div>
          </div>
        </div>
      </div>

      {storyData.isError && <ErrorBanner error={storyData.error as Error} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <ExportCard
          icon={<FileText size={20} className="text-violet-600" />}
          title="Story Document"
          description="Complete story assembled from official story files, including title, world, characters, and script."
          color="border-violet-300"
        >
          <DownloadButton
            ext=".txt"
            label="Plain text"
            onDownload={async () => {
              const { blob, filename } = await exportApi.story(storyId, "txt");
              triggerBlobDownload(blob, filename);
            }}
          />
          <DownloadButton
            ext=".md"
            label="Markdown"
            onDownload={async () => {
              const { blob, filename } = await exportApi.story(storyId, "md");
              triggerBlobDownload(blob, filename);
            }}
          />
          <DownloadButton
            ext=".docx"
            label="Word document"
            onDownload={async () => {
              const { blob, filename } = await exportApi.story(storyId, "docx");
              triggerBlobDownload(blob, filename);
            }}
          />
        </ExportCard>

        <ExportCard
          icon={<Layers size={20} className="text-emerald-600" />}
          title="Scenes Breakdown"
          description="Scenes grouped by chapter with settings, mood, purpose, and page counts."
          color="border-emerald-300"
        >
          <DownloadButton
            ext=".txt"
            label="Plain text"
            onDownload={async () => {
              const { blob, filename } = await exportApi.scenes(storyId, "txt");
              triggerBlobDownload(blob, filename);
            }}
          />
          <DownloadButton
            ext=".md"
            label="Markdown"
            onDownload={async () => {
              const { blob, filename } = await exportApi.scenes(storyId, "md");
              triggerBlobDownload(blob, filename);
            }}
          />
        </ExportCard>

        <ExportCard
          icon={<ImageIcon size={20} className="text-amber-600" />}
          title="Visual Descriptions"
          description={
            hasScriptData
              ? "Panel-by-panel visual descriptions from the manga script, including camera angles and scene composition."
              : "Panel visuals export requires a generated Manga Script."
          }
          color="border-amber-300"
        >
          {hasScriptData ? (
            <>
              <DownloadButton
                ext=".txt"
                label="Plain text"
                onDownload={async () => {
                  const { blob, filename } = await exportApi.visuals(storyId, "txt");
                  triggerBlobDownload(blob, filename);
                }}
              />
              <DownloadButton
                ext=".md"
                label="Markdown"
                onDownload={async () => {
                  const { blob, filename } = await exportApi.visuals(storyId, "md");
                  triggerBlobDownload(blob, filename);
                }}
              />
              <DownloadButton
                ext=".zip"
                label="Production bundle (sheets + CSV + prompts)"
                onDownload={async () => {
                  const { blob, filename } = await exportApi.visualsBundle(storyId);
                  triggerBlobDownload(blob, filename);
                }}
              />
            </>
          ) : (
            <span className="text-xs font-bold text-amber-700">
              {script.isLoading ? "Checking script..." : "Script not yet generated"}
            </span>
          )}
        </ExportCard>

        <ExportCard
          icon={<Archive size={20} className="text-rose-600" />}
          title="Raw JSON Archive"
          description="All six official story files as a single ZIP for backup or migration."
          color="border-rose-300"
        >
          <DownloadButton
            ext=".zip"
            label="All story files"
            onDownload={async () => {
              const { blob, filename } = await exportApi.rawZip(storyId);
              triggerBlobDownload(blob, filename);
            }}
          />
        </ExportCard>
      </div>

      <div className="rounded-2xl border-2 border-slate-200 bg-white/60 p-4">
        <div className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Format Guide</div>
        <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
          <div>
            <span className="font-bold text-slate-800">.txt</span> - Universal plain text. Works everywhere and is easy to copy into any tool.
          </div>
          <div>
            <span className="font-bold text-slate-800">.md</span> - Markdown with heading structure for Notion, Obsidian, GitHub, and Markdown editors.
          </div>
          <div>
            <span className="font-bold text-slate-800">.docx</span> - Microsoft Word format with heading styles, ready for editing or sharing.
          </div>
        </div>
      </div>
    </div>
  );
}
