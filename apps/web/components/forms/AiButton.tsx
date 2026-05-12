"use client";

import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AiButtonProps = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
  className?: string;
};

export function AiButton({ label, onClick, disabled = false, loading = false, variant = "primary", className }: AiButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2.5 text-sm font-black transition sm:rounded-2xl sm:px-5 sm:py-3 sm:text-base",
        isPrimary
          ? "ai-btn border-violet-600"
          : "border-violet-400 bg-violet-50 text-violet-700 hover:bg-violet-100",
        className
      )}
    >
      {loading ? (
        <Loader2 size={16} className="animate-spin" />
      ) : (
        <Sparkles size={16} className={cn("ai-sparkle", isPrimary ? "text-violet-200" : "text-violet-500")} />
      )}
      {label}
    </button>
  );
}
