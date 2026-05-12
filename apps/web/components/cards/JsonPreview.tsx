import { pretty } from "@/lib/utils";

export function JsonPreview({ data }: { data: unknown }) {
  return (
    <pre className="max-h-[520px] max-w-full overflow-auto rounded-2xl border-2 border-slate-900 bg-slate-950 p-4 text-xs text-lime-100">
      {pretty(data)}
    </pre>
  );
}
