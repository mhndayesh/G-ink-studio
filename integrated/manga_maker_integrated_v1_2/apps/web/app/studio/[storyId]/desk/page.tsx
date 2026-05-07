"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getExpansionText } from "@/lib/aiResults";
import { assembleStoryReader, type StoryReaderDocument } from "@/lib/storyReader";
import { useHydrateOnce } from "@/lib/hooks/useHydrate";
import { Panel } from "@/components/cards/Panel";
import { Field } from "@/components/forms/Field";
import { AiButton } from "@/components/forms/AiButton";
import { AiFillPanel } from "@/components/forms/AiFillPanel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { IntegrityLockGate } from "@/components/studio/IntegrityLockGate";

const PRIORITY_OPTIONS = ["Character Focus", "Plot Focus", "World Focus", "Dialogue Focus", "Action Focus", "Balanced"];
const EXPANSION_MODES = ["Light Expansion", "Medium Expansion", "Heavy Expansion", "Add Dialogue", "Add Manga Visual Detail", "Add Emotional Depth", "Add Action Detail"];

function ReviewLine({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid gap-1 border-t border-slate-100 py-2 text-xs sm:grid-cols-[9rem_1fr]">
      <dt className="font-black text-slate-500">{label}</dt>
      <dd className="text-slate-700">
        {values.length > 0 ? (
          <ul className="space-y-1">
            {values.map((value) => <li key={value}>{value}</li>)}
          </ul>
        ) : (
          <span className="font-bold text-slate-400">Not marked yet.</span>
        )}
      </dd>
    </div>
  );
}

function StoryReaderPanel({ reader, loading, error }: { reader: StoryReaderDocument; loading: boolean; error?: Error | null }) {
  return (
    <div className="max-h-[72vh] overflow-y-auto pr-1">
      {loading && <div className="mb-3 h-24 rounded-xl bg-slate-100 loading-shimmer" />}
      {error && (
        <div className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm font-bold text-red-700">
          Story Reader could not load plot context: {error.message}
        </div>
      )}

      <div className="mb-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
        <span className="font-black">Optional reference:</span> use this to read what already happened before writing the next scene, chapter, or arc. It is not a required step before export or approval, and it does not edit existing official story content.
      </div>

      <div className="rounded-xl border-2 border-slate-900 bg-slate-900 p-4 text-white">
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">{reader.title}</p>
        <h2 className="mt-1 text-xl font-black">{reader.arcTitle}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {reader.arcMeta.map((item) => (
            <span key={item} className="rounded-full border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-bold text-slate-100">{item}</span>
          ))}
        </div>
      </div>

      {reader.overview.length > 0 && (
        <div className="mt-3 rounded-xl border-2 border-slate-200 bg-white p-4">
          <h3 className="text-sm font-black">Arc Overview</h3>
          <div className="mt-2 space-y-2 text-sm leading-relaxed text-slate-700">
            {reader.overview.map((item) => <p key={item}>{item}</p>)}
          </div>
        </div>
      )}

      {reader.currentDraft && (
        <div className="mt-3 rounded-xl border-2 border-amber-200 bg-amber-50 p-4">
          <h3 className="text-sm font-black text-amber-900">Current Writing Draft</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-amber-950">{reader.currentDraft}</p>
        </div>
      )}

      {reader.chapters.length === 0 ? (
        <div className="mt-3 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm font-bold text-slate-500">No chapters yet. Create chapters on Plot Board.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          {reader.chapters.map((chapter) => (
            <article key={chapter.id} className="rounded-xl border-2 border-slate-900 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Chapter {chapter.number}</p>
                  <h3 className="text-lg font-black">Ch.{chapter.number} - {chapter.title}</h3>
                </div>
                <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-black text-violet-700">
                  {chapter.structureBeat}
                </span>
              </div>

              <div className="mt-4">
                <h4 className="text-sm font-black">Story</h4>
                <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-800">
                  {chapter.storyParagraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h4 className="text-sm font-black">Chapter Review</h4>
                <dl className="mt-2">
                  <ReviewLine label="Characters active" values={chapter.review.characters} />
                  <ReviewLine label="Relationship movement" values={chapter.review.relationshipMovement} />
                  <ReviewLine label="Threat / faction movement" values={chapter.review.threatMovement} />
                  <ReviewLine label="World or powers" values={chapter.review.worldRules} />
                  <ReviewLine label="Scene coverage" values={chapter.review.sceneCoverage} />
                  <ReviewLine label="Open hook" values={chapter.review.openHooks} />
                </dl>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DeskPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const workspace = useQuery({ queryKey: ["workspace", storyId], queryFn: () => api.getWorkspace(storyId) });
  const plot = useQuery({ queryKey: ["plot", storyId], queryFn: () => api.getPlotOutline(storyId) });
  const script = useQuery({ queryKey: ["script", storyId], queryFn: () => api.getChapterScript(storyId) });
  const characters = useQuery({ queryKey: ["characters", storyId], queryFn: () => api.getCharacters(storyId) });
  const masterStory = useQuery({ queryKey: ["master", storyId], queryFn: () => api.getMasterStory(storyId) });
  const questions = useQuery({ queryKey: ["questions", storyId], queryFn: () => api.getQuestions(storyId), enabled: false });
  const content = useMemo(() => (workspace.data?.content || workspace.data || {}) as any, [workspace.data]);
  const plotContent = useMemo(() => (plot.data?.content || plot.data || {}) as any, [plot.data]);
  const scriptContent = useMemo(() => (script.data?.content || script.data || {}) as any, [script.data]);
  const charactersContent = useMemo(() => (characters.data?.content || characters.data || {}) as any, [characters.data]);
  const masterContent = useMemo(() => (masterStory.data?.content || masterStory.data || {}) as any, [masterStory.data]);
  const reader = useMemo(() => assembleStoryReader({
    plotOutline: plotContent,
    chapterScript: scriptContent,
    characters: charactersContent,
    masterStory: masterContent,
    workspace: content,
  }), [plotContent, scriptContent, charactersContent, masterContent, content]);
  const [rightPanelView, setRightPanelView] = useState<"reader" | "json">("reader");
  const [text, setText] = useState("");
  const [inputType, setInputType] = useState("Scene Idea");
  const [userPriority, setUserPriority] = useState("");
  const [intentNotes, setIntentNotes] = useState("");
  const [protectedSections, setProtectedSections] = useState<string[]>([]);
  const [newProtectedSection, setNewProtectedSection] = useState("");
  const [expansionMode, setExpansionMode] = useState("Light Expansion");
  const [expanded, setExpanded] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasQuestions, setHasQuestions] = useState(false);
  // Hydrate from saved workspace JSON exactly once per story so reopening
  // the desk doesn't blow away the user's free-writing or their AI hints.
  useHydrateOnce(!!workspace.data, storyId, () => {
    const c = (workspace.data?.content || workspace.data || {}) as any;
    const fw = c.user_free_writing || {};
    if (fw.text) setText(fw.text);
    if (fw.input_type?.selected) setInputType(fw.input_type.selected);
    else if (typeof fw.input_type === "string" && fw.input_type) setInputType(fw.input_type);
    if (fw.user_priority?.selected) setUserPriority(fw.user_priority.selected);
    else if (typeof fw.user_priority === "string" && fw.user_priority) setUserPriority(fw.user_priority);
    if (fw.user_intent_notes) setIntentNotes(fw.user_intent_notes);
    if (Array.isArray(fw.do_not_change_these_parts)) setProtectedSections(fw.do_not_change_these_parts);
    const ai = c.ai_completion || {};
    if (ai.expansion_mode?.selected) setExpansionMode(ai.expansion_mode.selected);
    else if (typeof ai.expansion_mode === "string" && ai.expansion_mode) setExpansionMode(ai.expansion_mode);
  });

  const save = useMutation({
    mutationFn: () => api.saveFreeWriting(storyId, {
      text,
      input_type: inputType,
      user_priority: userPriority,
      user_intent_notes: intentNotes,
      do_not_change_these_parts: protectedSections,
    }),
    onSuccess: () => workspace.refetch(),
  });
  const ai = useMutation({
    mutationFn: (body?: { expansion_mode: string; text: string }) => api.aiComplete(storyId, body || { expansion_mode: expansionMode, text }),
    onSuccess: (data: any) => {
      if (!getExpansionText(data)) {
        setExpanded(null);
        setError(AI_EMPTY_MESSAGE);
        return;
      }
      setError(null);
      setExpanded(data);
    },
    onError: (err: any) => {
      const msg = err?.message || "AI expansion failed";
      setError(msg);
      setTimeout(() => setError(null), 5000);
    }
  });
  const acceptAi = useMutation({ mutationFn: () => api.aiDecision(storyId, { decision: "Accept" }), onSuccess: () => workspace.refetch() });
  const analyze = useMutation({
    mutationFn: () => api.analyzeWorkspace(storyId),
    onSuccess: (data: any) => {
      workspace.refetch();
      questions.refetch();
      const qs = data?.questions || data?.content?.consequence_questions?.questions || [];
      if (qs.length > 0) setHasQuestions(true);
    },
  });

  async function handleAiExpand() {
    const trimmed = text.trim();
    if (!trimmed && !content.user_free_writing?.text) {
      setError("Write an idea or free plot text before using AI completion.");
      return;
    }
    if (trimmed) {
      await save.mutateAsync();
    }
    ai.mutate({ expansion_mode: expansionMode, text: trimmed });
  }

  function addProtectedSection() {
    const trimmed = newProtectedSection.trim();
    if (trimmed && !protectedSections.includes(trimmed)) {
      setProtectedSections((p) => [...p, trimmed]);
      setNewProtectedSection("");
    }
  }

  function removeProtectedSection(section: string) {
    setProtectedSections((p) => p.filter((s) => s !== section));
  }

  return (
    <IntegrityLockGate storyId={storyId}>
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Writing Desk" subtitle="Write freely. AI expansion is optional; consequence detection is mandatory before official changes.">
        <div className="space-y-4">
          <Field label="What happens next?" value={text} onChange={setText} textarea placeholder="Kai fights Ren. Ren badly injures Kai. Mira discovers Ren was a spy." />

          {/* Input type */}
          <div>
            <label className="block">
              <span className="text-sm font-black">Input type</span>
              <input
                className="mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-4 focus:ring-amber-200/60 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base"
                value={inputType}
                onChange={(e) => setInputType(e.target.value)}
                placeholder="Scene Idea, Dialogue Draft, etc."
              />
            </label>
          </div>

          {/* User priority */}
          <div>
            <label className="block">
              <span className="text-sm font-black">AI expansion priority</span>
            </label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {PRIORITY_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setUserPriority(opt === userPriority ? "" : opt)}
                  className={`rounded-xl border-2 border-slate-900 px-3 py-2 text-left text-sm font-bold transition hover:-translate-y-0.5 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-base ${userPriority === opt ? "bg-slate-900 text-white" : "bg-white"}`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Intent notes */}
          <Field label="Intent notes" value={intentNotes} onChange={setIntentNotes} textarea placeholder="What you're trying to accomplish with this writing..." />

          {/* Protected sections */}
          <div>
            <label className="block">
              <span className="text-sm font-black">Protected sections (AI will not change these)</span>
            </label>
            {protectedSections.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {protectedSections.map((section) => (
                  <span key={section} className="inline-flex items-center gap-1 rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-1 text-sm font-bold">
                    {section}
                    <button onClick={() => removeProtectedSection(section)} className="ml-1 text-amber-600 hover:text-amber-800">&times;</button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 rounded-xl border-2 border-slate-900 bg-white px-3 py-2 text-sm outline-none transition-shadow focus:ring-4 focus:ring-amber-200/60 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-base"
                value={newProtectedSection}
                onChange={(e) => setNewProtectedSection(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addProtectedSection(); } }}
                placeholder="Add section to protect..."
              />
              <button
                className="rounded-xl border-2 border-amber-400 bg-amber-400 px-4 py-2 text-sm font-black text-white"
                onClick={addProtectedSection}
                disabled={!newProtectedSection.trim()}
              >
                Add
              </button>
            </div>
          </div>

          {/* AI Expansion Mode */}
          <AiFillPanel page="desk" fields={EXPANSION_MODES.map((m) => ({ key: m, label: m, description: m }))} note="Select the AI expansion mode. Light=clarify beats, Medium=add staging, Heavy=full draft, Dialogue=character lines, Visual=manga panels, Emotional=fears/desires, Action=battle beats." onFieldSelect={(sel) => { if (sel.length > 0) setExpansionMode(sel[0]); }} onGenerate={handleAiExpand} loading={ai.isPending} results={expanded ? { expanded_text: "See preview below" } : null} onClear={() => setExpanded(null)} error={error} onDismissError={() => setError(null)} />
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
            <span className="text-[10px] font-bold text-amber-700">Current mode: <span className="text-amber-900">{expansionMode}</span></span>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <button
              className="rounded-xl border-2 border-slate-900 bg-white px-4 py-2.5 text-sm font-black sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
              onClick={() => save.mutate()}
              disabled={!text || save.isPending}
            >
              Save Free Writing
            </button>
            <AiButton
              label="AI Expand"
              onClick={handleAiExpand}
              loading={ai.isPending || save.isPending}
              disabled={(!text && !content.user_free_writing?.text) || ai.isPending || save.isPending}
            />
            <AiButton
              label="AI Analyze"
              onClick={() => analyze.mutate()}
              loading={analyze.isPending}
              variant="secondary"
            />
            <button
              className="rounded-xl border-2 border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-black text-white sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base"
              onClick={() => analyze.mutate()}
              disabled={analyze.isPending}
            >
              Detect Consequences
            </button>
          </div>

          {/* Error Display */}
          {save.isError && <ErrorBanner error={save.error as Error} />}
          {ai.isError && <ErrorBanner error={ai.error as Error} />}
          {analyze.isError && <ErrorBanner error={analyze.error as Error} />}
          {error && !expanded && (
            <div className="rounded-xl border-2 border-red-400 bg-red-50 p-4 sm:rounded-2xl">
              <p className="text-sm font-bold text-red-700">{error}</p>
            </div>
          )}

          {/* AI Expansion Preview */}
          {expanded && (
            <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4 sm:rounded-2xl">
              <h3 className="flex items-center gap-2 font-black text-violet-800">
                <span className="text-lg">✨</span> AI Expansion Preview
              </h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                {getExpansionText(expanded)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="rounded-xl border-2 border-green-600 bg-green-600 px-4 py-2 text-sm font-black text-white"
                  onClick={() => acceptAi.mutate()}
                  disabled={acceptAi.isPending}
                >
                  ✓ Accept
                </button>
                <button
                  className="rounded-xl border-2 border-slate-400 bg-white px-4 py-2 text-sm font-black text-slate-600"
                  onClick={() => setExpanded(null)}
                >
                  ✕ Discard
                </button>
              </div>
            </div>
          )}

          {/* Detected Questions */}
          {hasQuestions && (
            <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50 p-4 sm:rounded-2xl">
              <h3 className="font-black text-emerald-800">Consequences Detected</h3>
              <p className="mt-1 text-sm text-emerald-700">The system found consequences that need your input.</p>
              <Link
                href={`/studio/${storyId}/court`}
                className="mt-3 inline-block rounded-xl border-2 border-emerald-600 bg-emerald-600 px-5 py-2.5 text-sm font-black text-white sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base hover:bg-emerald-700"
              >
                Go to Consequence Court
              </Link>
            </div>
          )}
          {questions.data && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 sm:rounded-2xl">
              <h3 className="font-black text-amber-800">⚠ Detected Consequences</h3>
              <StructuredJsonView data={questions.data} />
            </div>
          )}
        </div>
      </Panel>
      <Panel
        title={rightPanelView === "reader" ? "Story Reader" : "plot_workspace.json"}
        subtitle={rightPanelView === "reader" ? "Clean story context for writing. Read-only; nothing here saves to story JSON." : undefined}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-xl border-2 border-slate-900 bg-white p-1">
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-black ${rightPanelView === "reader" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              onClick={() => setRightPanelView("reader")}
            >
              Reader
            </button>
            <button
              type="button"
              className={`rounded-lg px-3 py-1.5 text-xs font-black ${rightPanelView === "json" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}
              onClick={() => setRightPanelView("json")}
            >
              JSON
            </button>
          </div>
          {rightPanelView === "reader" && (
            <span className="text-xs font-bold text-slate-400">Built from plot, scenes, script, characters, and world data.</span>
          )}
        </div>
        {rightPanelView === "reader" ? (
          <StoryReaderPanel reader={reader} loading={plot.isLoading || script.isLoading || characters.isLoading || masterStory.isLoading} error={(plot.error as Error) || null} />
        ) : (
          <StructuredJsonView data={content} />
        )}
      </Panel>
    </div>
    </IntegrityLockGate>
  );
}
