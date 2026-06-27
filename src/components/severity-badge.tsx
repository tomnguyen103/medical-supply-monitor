import { cn } from "@/lib/utils";
import type { Severity } from "@/lib/connectors/types";

// Semantic status colors for risk levels (NOT the brand accent). Used only on
// risk indicators, where color conveys real state.
const STYLES: Record<Severity, string> = {
  info: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  low: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  moderate: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
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
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        STYLES[level],
        className,
      )}
    >
      {LABELS[level]}
    </span>
  );
}
