export function Field({ label, value, onChange, placeholder, textarea = false, onKeyDown }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; textarea?: boolean; onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void }) {
  const base = "mt-1.5 w-full rounded-xl border-2 border-slate-900 bg-white px-3 py-2.5 text-sm outline-none transition-shadow focus:ring-4 focus:ring-amber-200/60 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-base";
  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      {textarea ? (
        <textarea
          className={`${base} min-h-[120px] resize-y sm:min-h-[144px]`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          className={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}
