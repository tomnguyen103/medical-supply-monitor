import { TriangleAlert } from "lucide-react";

import { PageHeader, StatTile } from "@/components/dashboard/primitives";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { integrations } from "@/lib/env";
import { getCatalogContext, getCatalogCounts } from "@/lib/catalog";
import { SCORING_VERSION } from "@/lib/risk/scoring";
import { DAILY_BRIEF_GRAPH } from "@/lib/ai/graph";

// Reads per-tenant catalog counts: always render per-request.
export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const NEXT_STEPS = [
  { phase: "Phase 7", text: "RBAC polish, audit logs, rate limits, retention controls" },
];

export default async function OverviewPage() {
  const ctx = await getCatalogContext();
  const counts = ctx.ready ? await getCatalogCounts(ctx.orgId) : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Foundation, catalog imports, ingestion, scoring, alerts, daily briefs, and the guarded AI workflow are live."
      />

      {!integrations.database && (
        <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
          <TriangleAlert
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
          <div className="text-sm">
            <p className="font-medium">No database connected yet</p>
            <p className="mt-0.5 text-muted-foreground">
              Set <code className="font-mono">DATABASE_URL</code> in{" "}
              <code className="font-mono">.env.local</code>, then run{" "}
              <code className="font-mono">npm run db:migrate</code>. The shell
              renders without it so you can explore the structure.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Monitored items"
          value={counts ? String(counts.items) : "0"}
          hint={counts ? `${counts.watched} on watchlist` : "Import a catalog to begin"}
        />
        <StatTile
          label="Suppliers"
          value={counts ? String(counts.suppliers) : "0"}
          hint="Supplier exposure"
        />
        <StatTile
          label="Facilities"
          value={counts ? String(counts.facilities) : "0"}
          hint="Sites you monitor"
        />
        <StatTile
          label="Scoring version"
          value={SCORING_VERSION}
          hint={`${DAILY_BRIEF_GRAPH.nodes.length}-node AI workflow`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SetupChecklist />
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-medium">What comes next</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Phase 6 AI workflow is in. Hardening remains before demo readiness.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {NEXT_STEPS.map((step) => (
              <li key={step.phase} className="flex items-start gap-3 px-5 py-3">
                <span className="mt-0.5 font-mono text-xs text-primary">{step.phase}</span>
                <span className="text-sm text-muted-foreground">{step.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
