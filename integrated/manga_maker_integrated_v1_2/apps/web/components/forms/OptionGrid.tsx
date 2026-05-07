import { cn } from "@/lib/utils";

export function OptionGrid({ options, selected, onSelect, multi = false }: { options: string[]; selected: string | string[]; onSelect: (value: string) => void; multi?: boolean }) {
  const isSelected = (option: string) => multi ? Array.isArray(selected) && selected.includes(option) : selected === option;
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onSelect(option)}
          className={cn(
            "rounded-xl border-2 border-slate-900 px-3 py-2 text-left text-sm font-bold transition hover:-translate-y-0.5 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-base",
            isSelected(option) ? "bg-slate-900 text-white" : "bg-white"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
