"use client";

export function CustomInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="mt-2 block">
      <span className="text-xs font-black text-amber-700">{label}</span>
      <input
        className="mt-1 w-full rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm outline-none transition-shadow focus:ring-4 focus:ring-amber-200/60 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-base"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Describe your custom option..."}
      />
    </label>
  );
}
