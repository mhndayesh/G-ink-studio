"use client";

import { useState, useEffect, useRef } from "react";
import { AiButton } from "./AiButton";

type FieldOption = { key: string; label: string; description?: string };

export function AiFillPanel({
  page: _page,
  fields,
  note,
  onFieldSelect,
  onGenerate,
  loading,
  results,
  onClear,
  onApply,
  disabled,
  disabledReason,
  error,
  onDismissError,
}: {
  page: string;
  fields: FieldOption[];
  note: string;
  onFieldSelect: (selectedKeys: string[]) => void;
  onGenerate: () => void;
  loading: boolean;
  results: Record<string, any> | null;
  onClear: () => void;
  onApply?: (results: Record<string, any>) => void;
  disabled?: boolean;
  disabledReason?: string;
  error?: string | null;
  onDismissError?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const lastAutoAppliedRef = useRef<Record<string, any> | null>(null);
  const [justApplied, setJustApplied] = useState(false);

  useEffect(() => {
    onFieldSelect(selected);
  }, [onFieldSelect, selected]);

  useEffect(() => {
    if (results && onApply && lastAutoAppliedRef.current !== results) {
      lastAutoAppliedRef.current = results;
      onApply(results);
      setJustApplied(true);
      const t = setTimeout(() => setJustApplied(false), 4000);
      return () => clearTimeout(t);
    }
  }, [results, onApply]);

  function toggleField(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  return (
    <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-3 sm:rounded-2xl sm:p-4">
      <button className="flex w-full items-center justify-between" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🤖</span>
          <span className="font-black text-violet-800 text-sm sm:text-base">AI Assistant</span>
        </div>
        <span className="text-xs text-violet-500">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          <p className="text-xs leading-relaxed text-violet-700">{note}</p>

          {/* Field selector */}
          <div>
            <span className="text-xs font-bold text-violet-600">Select fields to generate:</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
              {fields.map((f) => (
                <button
                  key={f.key}
                  onClick={() => toggleField(f.key)}
                  className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                    selected.includes(f.key)
                      ? "border-violet-600 bg-violet-600 text-white"
                      : "border-violet-200 bg-white text-violet-600 hover:border-violet-400"
                  }`}
                  title={f.description}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Generate button */}
          <AiButton
            label={`Generate ${selected.length > 0 ? selected.length : ""} Field${selected.length !== 1 ? "s" : ""}`}
            onClick={onGenerate}
            loading={loading}
            disabled={selected.length === 0 || loading || disabled}
          />
          {disabled && disabledReason && (
            <p className="text-xs font-bold text-red-600">{disabledReason}</p>
          )}

          {error && (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-bold text-red-700">{error}</p>
                {onDismissError && <button onClick={onDismissError} className="text-xs font-bold text-red-600 underline">Dismiss</button>}
              </div>
            </div>
          )}

          {/* Results */}
          {results && !error && (
            <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-700">
                  {onApply ? "✓ Fields filled — review and edit below" : "✨ Generated — see preview below"}
                </span>
                <div className="flex gap-2">
                  {onApply && <button onClick={() => { lastAutoAppliedRef.current = null; onApply(results); }} className="text-xs font-bold text-indigo-600 underline">Re-apply</button>}
                  <button onClick={onClear} className="text-xs font-bold text-emerald-600 underline">Clear</button>
                </div>
              </div>
              <pre className="mt-1 max-h-32 overflow-y-auto text-[10px] text-emerald-800 whitespace-pre-wrap">{JSON.stringify(results, null, 2)}</pre>
            </div>
          )}

          {justApplied && !results && !error && (
            <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-2">
              <span className="text-xs font-black text-emerald-700">✓ Fields filled — review and edit below</span>
            </div>
          )}

          {/* Errors / warnings */}
          {results?.["_warnings"] && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-2">
              <p className="text-[10px] text-amber-700">{results._warnings}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
