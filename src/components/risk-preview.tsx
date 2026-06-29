// The signature element: the live product surface rendered as a precision
// instrument — a porcelain panel seated in a machined tray. Sample data, clearly
// labeled. Ambient "scan" + live pulse are pure CSS and respect reduced motion.

type Level = "critical" | "high" | "moderate" | "low";

type Row = { item: string; level: Level; reason: string; days: string };

const ROWS: Row[] = [
  {
    item: "Sodium Chloride 0.9% IV, 1000 mL",
    level: "critical",
    reason: "openFDA shortage · sole-source supplier",
    days: "06",
  },
  {
    item: "Sterile Water for Injection",
    level: "high",
    reason: "Active recall on one lot",
    days: "11",
  },
  {
    item: "Propofol 10 mg/mL",
    level: "moderate",
    reason: "Supplier site under flood watch",
    days: "23",
  },
  {
    item: "Nitrile Exam Gloves, Medium",
    level: "low",
    reason: "Lead time +9d vs. baseline",
    days: "48",
  },
];

// Light-only severity colors (AA on the porcelain panel). Distinct from the
// brand accent — color here conveys real state.
const SEV: Record<Level, { label: string; color: string }> = {
  critical: { label: "Critical", color: "#b42318" },
  high: { label: "High", color: "#b54708" },
  moderate: { label: "Moderate", color: "#8a6a00" },
  low: { label: "Low", color: "#036b4f" },
};

export function RiskPreview() {
  return (
    <div className="bezel">
      <div className="bezel-inner relative">
        {/* ambient scan sweep */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
          <div
            className="scan-line absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, color-mix(in oklch, var(--petrol) 13%, transparent) 5%, transparent 12%)",
            }}
          />
        </div>

        {/* header / calibration row */}
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-2 items-center justify-center">
              <span className="pulse-dot absolute size-2 rounded-full bg-petrol" />
              <span className="relative size-1.5 rounded-full bg-petrol" />
            </span>
            <span className="font-data text-[11px] font-medium uppercase tracking-[0.18em] text-ink-soft">
              Live watchlist
            </span>
          </div>
          <span className="rounded-full border border-hairline px-2.5 py-0.5 font-data text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            Sample data
          </span>
        </div>

        {/* rows */}
        <ul className="divide-y divide-hairline">
          {ROWS.map((row) => {
            const sev = SEV[row.level];
            return (
              <li key={row.item} className="flex items-center gap-3.5 px-5 py-3.5">
                <span
                  aria-hidden
                  className="h-8 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: sev.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium leading-tight text-ink">
                    {row.item}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] leading-tight text-ink-faint">
                    {row.reason}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="font-data text-[12px] tabular-nums text-ink-soft">
                    {row.days}
                    <span className="text-ink-faint">d</span>
                  </span>
                  <span
                    className="font-data text-[10px] font-medium uppercase tracking-[0.12em]"
                    style={{ color: sev.color }}
                  >
                    {sev.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        {/* footer / readout */}
        <div className="flex items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <span className="font-data text-[11px] tabular-nums text-ink-faint">
            Updated 14:32 CT
          </span>
          <span className="text-[11px] text-ink-faint">
            Each row traces to its signals &amp; evidence
          </span>
        </div>
      </div>
    </div>
  );
}
