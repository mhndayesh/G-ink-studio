"use client";

import type React from "react";
import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, AlertTriangle, Archive, CheckCircle, Download, FileText, Image as ImageIcon, Info, Layers, Loader2, ShieldCheck } from "lucide-react";
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

interface ValidationWarning {
  level: string;
  category: string;
  message: string;
  where: string;
}

const LEVEL_ORDER = ["critical", "high", "medium", "info"] as const;
const LEVEL_STYLES: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode; label: string }> = {
  critical: { bg: "bg-red-50", border: "border-red-400", text: "text-red-900", icon: <AlertCircle size={16} className="text-red-600" />, label: "Critical" },
  high: { bg: "bg-orange-50", border: "border-orange-400", text: "text-orange-900", icon: <AlertTriangle size={16} className="text-orange-600" />, label: "High" },
  medium: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-900", icon: <AlertTriangle size={16} className="text-amber-600" />, label: "Medium" },
  info: { bg: "bg-slate-50", border: "border-slate-400", text: "text-slate-700", icon: <Info size={16} className="text-slate-500" />, label: "Info" },
};

function ValidationPanel({ warnings, isLoading }: { warnings: ValidationWarning[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="rounded-2xl border-2 border-slate-200 bg-white/60 p-4 text-xs text-slate-500">
        <Loader2 size={14} className="mr-2 inline animate-spin" /> Checking export readiness...
      </div>
    );
  }
  if (!warnings.length) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-[3px_3px_0_0_#10b981]">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-700" />
          <div className="text-sm font-black text-emerald-900">Export ready</div>
        </div>
        <div className="mt-1 text-xs text-emerald-800">
          No data-quality issues detected. The export is fully compatible with G-Ink Studio.
        </div>
      </div>
    );
  }
  const grouped: Record<string, ValidationWarning[]> = {};
  for (const w of warnings) (grouped[w.level] ||= []).push(w);

  return (
    <div className="rounded-2xl border-2 border-slate-900 bg-white p-5 shadow-[3px_3px_0_0_#1e293b]">
      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle size={18} className="text-orange-600" />
        <div className="text-base font-black">Export Validation</div>
        <span className="ml-auto text-xs font-bold text-slate-500">{warnings.length} issue(s) to review</span>
      </div>
      <div className="space-y-3">
        {LEVEL_ORDER.flatMap((level) =>
          (grouped[level] || []).map((w, i) => {
            const s = LEVEL_STYLES[level] ?? LEVEL_STYLES.info;
            return (
              <div key={`${level}-${i}`} className={`rounded-xl border-2 ${s.border} ${s.bg} p-3`}>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">{s.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-black uppercase tracking-wider ${s.text}`}>{s.label}</span>
                      <span className="text-[10px] font-bold text-slate-400">[{w.category}]</span>
                    </div>
                    <div className={`mt-1 text-xs ${s.text}`}>{w.message}</div>
                    {w.where && (
                      <div className="mt-1 text-[11px] font-bold text-slate-600">Where to fix: {w.where}</div>
                    )}
                  </div>
                </div>
              </div>
            );
          }),
        )}
      </div>
    </div>
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

  const chaptersStatus = useQuery({
    queryKey: ["chaptersStatus", storyId],
    queryFn: () => api.getChapterScriptStatuses(storyId),
  });

  const validation = useQuery({
    queryKey: ["exportValidate", storyId],
    queryFn: () => api.validateExport(storyId),
  });

  const hasScriptData = (chaptersStatus.data?.chapters || []).some((ch: any) => ch.has_script);

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

      <ValidationPanel
        warnings={(validation.data?.warnings || []) as ValidationWarning[]}
        isLoading={validation.isLoading}
      />

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
              {chaptersStatus.isLoading ? "Checking scripts..." : "No chapter scripts generated yet"}
            </span>
          )}
        </ExportCard>

        <ExportCard
          icon={<Archive size={20} className="text-indigo-600" />}
          title="G-Ink Studio Bundle"
          description="All three asset files (*-story, *-visuals, *-scenes) in one ZIP — import directly into G-Ink Studio."
          color="border-indigo-300"
        >
          <DownloadButton
            ext=".zip"
            label="story + visuals + scenes"
            onDownload={async () => {
              const { blob, filename } = await exportApi.tripleZip(storyId);
              triggerBlobDownload(blob, filename);
            }}
          />
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
