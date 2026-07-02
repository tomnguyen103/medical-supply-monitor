import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/connectors/types";

// Semantic status colors for risk levels (NOT the brand accent). Used only on
// risk indicators, where color conveys real state.
const STYLES: Record<Severity, string> = {
  info: "border-slate-300/70 bg-slate-100/80 text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300",
  low: "border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  moderate: "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  high: "border-orange-300/70 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300",
  critical: "border-red-300/70 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300",
};

const LABELS: Record<Severity, string> = {
  info: "Info",
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export function SeverityBadge({
  level,
  className,
}: {
  level: Severity;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none",
        STYLES[level],
        className,
      )}
    >
      {LABELS[level]}
    </span>
  );
}
