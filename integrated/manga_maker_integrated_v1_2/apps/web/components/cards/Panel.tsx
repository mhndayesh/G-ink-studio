import { cn } from "@/lib/utils";

export function Panel({ title, subtitle, children, className }: { title?: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("manga-panel rounded-xl p-4 sm:rounded-studio sm:p-5 min-w-0", className)}>
      {title && <h2 className="text-xl font-black tracking-tight sm:text-2xl">{title}</h2>}
      {subtitle && <p className="mt-1 text-xs text-slate-600 sm:text-sm">{subtitle}</p>}
      <div className={cn(title || subtitle ? "mt-3 sm:mt-4" : "", "min-w-0")}>{children}</div>
    </section>
  );
}
