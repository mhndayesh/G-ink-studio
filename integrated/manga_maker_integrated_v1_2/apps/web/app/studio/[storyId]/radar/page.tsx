"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Panel } from "@/components/cards/Panel";
import { StructuredJsonView } from "@/components/cards/StructuredJsonView";
import { ErrorBanner } from "@/components/forms/ErrorBanner";

export default function RadarPage() {
  const { storyId } = useParams<{ storyId: string }>();
  const reports = useQuery({ queryKey: ["continuity", storyId], queryFn: () => api.continuityReports(storyId) });
  const check = useMutation({ mutationFn: () => api.checkContinuityCurrent(storyId), onSuccess: () => reports.refetch() });
  const reportsArray = Array.isArray(reports.data) ? reports.data : (reports.data?.reports || []);
  const latestReport = reportsArray.length > 0 ? reportsArray[reportsArray.length - 1] : null;
  const issueCount = Array.isArray(latestReport?.issues) ? latestReport.issues.length : 0;
  const warningCount = Array.isArray(latestReport?.warnings) ? latestReport.warnings.length : 0;
  return (
    <div className="grid gap-4 sm:gap-5 lg:grid-cols-[1fr_1fr]">
      <Panel title="Continuity Radar" subtitle="Checks filename rules, relationship map activation, version state, and script/story logic.">
        {!reportsArray.length && !reports.isLoading && (
          <div className="mb-4 rounded-xl border-2 border-dashed border-slate-300 p-4 text-center text-sm font-bold text-slate-500">No continuity reports yet. Click Run Current Continuity Check above to scan your story for filename rules, relationship map activation, version state, and script/story logic issues.</div>
        )}
        <button
          className="w-full rounded-xl border-2 border-slate-900 bg-slate-900 px-5 py-3 text-sm font-black text-white sm:w-auto sm:rounded-2xl sm:text-base"
          onClick={() => check.mutate()}
          disabled={check.isPending}
        >
          {check.isPending ? "Checking..." : "Run Current Continuity Check"}
        </button>
        {check.isError && <ErrorBanner error={check.error as Error} />}
        {latestReport && (
          <div className="mt-4 grid gap-2 sm:mt-5 sm:grid-cols-2 sm:gap-3">
            <div className={`rounded-xl border-2 p-3 sm:rounded-2xl sm:p-4 ${issueCount > 0 ? "border-red-400 bg-red-50" : "border-emerald-400 bg-emerald-50"}`}>
              <div className="text-sm font-black sm:text-base">Issues</div>
              <div className={`mt-1 text-2xl font-black ${issueCount > 0 ? "text-red-600" : "text-emerald-600"}`}>{issueCount}</div>
              <div className="text-xs text-slate-600">{issueCount > 0 ? "Blocking contradictions" : "No blocking contradictions"}</div>
            </div>
            <div className={`rounded-xl border-2 p-3 sm:rounded-2xl sm:p-4 ${warningCount > 0 ? "border-amber-400 bg-amber-50" : "border-slate-300 bg-slate-50"}`}>
              <div className="text-sm font-black sm:text-base">Warnings</div>
              <div className={`mt-1 text-2xl font-black ${warningCount > 0 ? "text-amber-600" : "text-slate-500"}`}>{warningCount}</div>
              <div className="text-xs text-slate-600">{warningCount > 0 ? "Non-blocking notes" : "No warnings"}</div>
            </div>
            {latestReport.report_id && (
              <div className="sm:col-span-2 rounded-xl border-2 border-slate-300 bg-white p-3 sm:rounded-2xl sm:p-4">
                <div className="text-[10px] font-black text-slate-400 uppercase">Latest report</div>
                <div className="mt-1 text-sm font-bold">{latestReport.report_id}</div>
                {latestReport.version_id && <div className="text-xs text-slate-500">{latestReport.version_id}</div>}
              </div>
            )}
          </div>
        )}
      </Panel>
      <Panel title="Continuity Reports"><StructuredJsonView data={reports.data || {}} /></Panel>
    </div>
  );
}
