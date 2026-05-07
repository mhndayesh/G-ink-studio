"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import { AI_EMPTY_MESSAGE, getUsableAiOutput } from "@/lib/aiResults";
import { Panel } from "@/components/cards/Panel";
import { AiFillPanel } from "@/components/forms/AiFillPanel";
import { ConfirmationSummary } from "@/components/cards/ConfirmationSummary";
import { ErrorBanner } from "@/components/forms/ErrorBanner";
import { IntegrityLockGate } from "@/components/studio/IntegrityLockGate";

type AnswerState = Record<string, { selected: string; custom_answer?: string; loading: boolean; answered: boolean }>;

export default function CourtPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const router = useRouter();
  const questions = useQuery({ queryKey: ["questions", storyId], queryFn: () => api.getQuestions(storyId) });
  const confirmation = useQuery({ queryKey: ["confirmation", storyId], queryFn: () => api.getConfirmation(storyId) });
  const approve = useMutation({
    mutationFn: (decision: "Approve All" | "Reject All" = "Approve All") => api.approveWorkspace(storyId, decision),
    onSuccess: () => confirmation.refetch(),
  });
  const questionList = questions.data?.questions || questions.data?.content?.consequence_questions?.questions || [];

  const [answers, setAnswers] = useState<AnswerState>({});
  const [aiCourtFields, setAiCourtFields] = useState<string[]>([]);
  const [aiCourtResults, setAiCourtResults] = useState<Record<string, any> | null>(null);
  const [aiCourtError, setAiCourtError] = useState<string | null>(null);
  const aiGen = useMutation({
    mutationFn: () => api.aiGenerate(storyId, { page: "court", target_fields: aiCourtFields, partial_input: {}, generation_hints: {} }),
    onSuccess: (d: any) => {
      let gen: Record<string, any>;
      try {
        gen = getUsableAiOutput("court", aiCourtFields, d);
        setAiCourtError(null);
      } catch (err: any) {
        setAiCourtResults(null);
        setAiCourtError(err?.message || AI_EMPTY_MESSAGE);
        return;
      }
      const suggested = gen.suggested_answers || [];
      if (suggested.length > 0) {
        setAiCourtResults(gen);
        suggested.forEach((s: any) => {
          if (s.question_id && s.suggested_selected) {
            handleAnswer(s.question_id, s.suggested_selected);
          }
        });
      }
    },
    onError: (err: any) => {
      setAiCourtResults(null);
      setAiCourtError(err?.message || "AI request failed. Retry in a minute or fill manually.");
    },
  });

  const answerQuestionMut = useMutation({
    mutationFn: ({ questionId, body }: { questionId: string; body: any }) => api.answerQuestion(storyId, questionId, body),
    onSuccess: (_data, vars) => {
      setAnswers((prev) => ({
        ...prev,
        [vars.questionId]: { ...prev[vars.questionId], loading: false, answered: true, selected: vars.body.selected, custom_answer: vars.body.custom_answer || "" },
      }));
      questions.refetch();
      confirmation.refetch();
    },
  });

  const handleAnswer = useCallback((questionId: string, selected: string) => {
    const current = answers[questionId];
    if (current?.loading) return;
    const body = selected === "Custom" ? { selected, custom_answer: current?.custom_answer || "" } : { selected };
    setAnswers((prev) => ({ ...prev, [questionId]: { selected, custom_answer: selected === "Custom" ? (current?.custom_answer || "") : undefined, loading: true, answered: false } }));
    answerQuestionMut.mutate({ questionId, body });
  }, [answers, answerQuestionMut]);

  const handleCustomChange = useCallback((questionId: string, custom_answer: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], custom_answer, selected: "Custom" } }));
  }, []);

  const handleCustomSubmit = useCallback((questionId: string) => {
    const current = answers[questionId];
    if (!current || current.loading) return;
    setAnswers((prev) => ({ ...prev, [questionId]: { ...prev[questionId], loading: true } }));
    answerQuestionMut.mutate({ questionId, body: { selected: "Custom", custom_answer: current.custom_answer || "" } });
  }, [answers, answerQuestionMut]);

  return (
    <IntegrityLockGate storyId={storyId}>
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Consequence Court" subtitle="Review and answer detected consequences. Per-chapter version creation now lives on the Manga Script page.">
        <AiFillPanel page="court" fields={[{ key: "suggest_answers", label: "Suggest Answers", description: "AI reads story context to suggest logical answers for all questions" }]} note="Required: at least one consequence question must exist. AI analyzes your story context to suggest the most logical answer for each consequence question based on story continuity." onFieldSelect={setAiCourtFields} onGenerate={() => { if (!Array.isArray(questionList) || questionList.length === 0) { alert("No consequence questions yet. Write a chapter on Writing Desk first to generate questions."); return; } aiGen.mutate(); }} loading={aiGen.isPending} results={aiCourtResults} onClear={() => setAiCourtResults(null)} disabled={!Array.isArray(questionList) || questionList.length === 0} disabledReason="No consequence questions yet. Write a chapter on Writing Desk first." error={aiCourtError} onDismissError={() => setAiCourtError(null)} />
        {aiGen.isError && <div className="mb-3"><ErrorBanner error={aiGen.error as Error} /></div>}
        <div className="space-y-3 sm:space-y-4">
          {questions.isLoading ? (
            <p className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-500">Loading questions...</p>
          ) : Array.isArray(questionList) && questionList.length ? questionList.map((q: any) => {
            const a = answers[q.question_id];
            const isAnswered = a?.answered;
            const isLoading = a?.loading;
            return (
              <div key={q.question_id} className={`rounded-xl border-2 bg-white p-3 sm:rounded-2xl sm:p-4 transition-colors ${isAnswered ? "border-emerald-500" : "border-slate-900"}`}>
                <h3 className="font-black text-sm sm:text-base">
                  {q.question || "Consequence Question"}
                  {isAnswered && <span className="ml-2 text-emerald-600 text-xs">✓ Answered</span>}
                </h3>
                <div className="mt-2 flex flex-wrap gap-2 sm:mt-3">
                  {(q.options || ["Yes", "No", "Custom"]).map((o: string) => {
                    const isSelected = a?.selected === o;
                    return (
                      <button
                        key={o}
                        className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm transition ${isSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-900 bg-white hover:bg-slate-100"} ${isLoading || isAnswered ? "opacity-60 pointer-events-none" : ""}`}
                        onClick={() => handleAnswer(q.question_id, o)}
                        disabled={isLoading || isAnswered}
                      >
                        {o}
                      </button>
                    );
                  })}
                </div>
                {a?.selected === "Custom" && (
                  <div className="mt-2 flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block">
                        <span className="text-xs font-black text-amber-700">Custom answer</span>
                        <input
                          className="mt-1 w-full rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm outline-none transition-shadow focus:ring-4 focus:ring-amber-200/60 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-base"
                          value={a.custom_answer || ""}
                          onChange={(e) => handleCustomChange(q.question_id, e.target.value)}
                          placeholder="Type your custom answer..."
                          disabled={isLoading || isAnswered}
                        />
                      </label>
                    </div>
                    {!isAnswered && (
                      <button
                        className="rounded-xl border-2 border-amber-400 bg-amber-400 px-3 py-2 text-xs font-black text-white sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm"
                        onClick={() => handleCustomSubmit(q.question_id)}
                        disabled={isLoading || !a.custom_answer?.trim()}
                      >
                        Submit
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }) : (
            <p className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-sm font-bold text-amber-800">
              No questions yet. Run analysis in Writing Desk first.
            </p>
          )}
          {answerQuestionMut.isError && <ErrorBanner error={answerQuestionMut.error as Error} />}
          {approve.isError && <ErrorBanner error={approve.error as Error} />}
          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:rounded-2xl sm:text-base"
              onClick={() => approve.mutate("Approve All")}
              disabled={approve.isPending || !confirmation.data || confirmation.data?.status === "not_ready"}
            >
              {approve.isPending ? "Approving..." : "Mark Workspace Reviewed"}
            </button>
            <button
              className="rounded-xl border-2 border-red-400 bg-white px-5 py-3 text-sm font-black text-red-600 sm:rounded-2xl sm:text-base"
              onClick={() => { if (confirm("Reject all proposed changes? This discards the workspace draft.")) approve.mutate("Reject All"); }}
              disabled={approve.isPending}
            >
              Reject All
            </button>
            <button
              className="rounded-xl border-2 border-slate-400 bg-white px-5 py-3 text-sm font-black text-slate-600 sm:rounded-2xl sm:text-base"
              onClick={() => router.push(`/studio/${storyId}/desk`)}
            >
              Go Back to Desk
            </button>
          </div>
        </div>
      </Panel>
      <Panel title="Final Confirmation"><ConfirmationSummary data={confirmation.data} /></Panel>
    </div>
    </IntegrityLockGate>
  );
}
