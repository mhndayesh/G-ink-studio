"use client";

import { XCircle } from "lucide-react";

export function ErrorBanner({ error, onDismiss }: { error: Error | string | null; onDismiss?: () => void }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error?.message || "An error occurred";
  return (
    <div className="rounded-xl border-2 border-red-400 bg-red-50 p-3 sm:rounded-2xl sm:p-4 flex items-start justify-between gap-2">
      <p className="text-sm font-bold text-red-700">{message}</p>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 shrink-0" title="Dismiss">
          <XCircle size={16} />
        </button>
      )}
    </div>
  );
}
