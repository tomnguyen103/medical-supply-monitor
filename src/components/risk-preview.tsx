import { SeverityBadge } from "@/components/severity-badge";
import type { Severity } from "@/lib/connectors/types";

// A real, rendered mini-version of the product surface (sample data, clearly
// labeled). Not a fake screenshot — these are the same components the app uses.
const SAMPLE_ROWS: Array<{
  item: string;
  level: Severity;
  reason: string;
  daysOnHand: string;
}> = [
  {
    item: "Sodium Chloride 0.9% IV, 1000 mL",
    level: "critical",
    reason: "openFDA shortage + sole-source supplier",
    daysOnHand: "6d",
  },
  {
    item: "Sterile Water for Injection",
    level: "high",
    reason: "Active recall on one lot",
    daysOnHand: "11d",
  },
  {
    item: "Propofol 10 mg/mL",
    level: "moderate",
    reason: "Supplier site in a flood-watch region",
    daysOnHand: "23d",
  },
  {
    item: "Nitrile Exam Gloves, M",
    level: "low",
    reason: "Lead time up 9 days vs. baseline",
    daysOnHand: "48d",
  },
];

export function RiskPreview() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="text-sm font-medium">Today&rsquo;s watchlist</div>
        <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          Sample data
        </span>
      </div>
      <ul className="divide-y divide-border">
        {SAMPLE_ROWS.map((row) => (
          <li key={row.item} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.item}</p>
              <p className="truncate text-xs text-muted-foreground">{row.reason}</p>
            </div>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {row.daysOnHand}
            </span>
            <SeverityBadge level={row.level} />
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        Every row links to the signals and evidence behind it.
      </div>
    </div>
  );
}
