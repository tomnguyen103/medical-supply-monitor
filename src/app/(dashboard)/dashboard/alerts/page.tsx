import { Bell } from "lucide-react";

import { AlertEventsTable } from "@/components/dashboard/alert-events-table";
import { AlertRulesPanel } from "@/components/dashboard/alert-rules-panel";
import { CatalogBlocked } from "@/components/dashboard/catalog-blocked";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { getCatalogContext } from "@/lib/catalog";
import { listAlertEvents, listAlertRules } from "@/lib/alerts/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const ctx = await getCatalogContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Alerts"
        description="Alert rules, daily briefs, approval gates, and delivery history with evidence."
      />
      {!ctx.ready ? (
        <CatalogBlocked reason={ctx.reason} />
      ) : (
        <AlertsContent organizationId={ctx.orgId} />
      )}
    </div>
  );
}

async function AlertsContent({ organizationId }: { organizationId: string }) {
  const [rules, events] = await Promise.all([
    listAlertRules(organizationId),
    listAlertEvents(organizationId, 100),
  ]);

  return (
    <div className="space-y-8">
      <AlertRulesPanel rules={rules} />
      {events.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alert events yet"
          body="Create a rule or run evaluation after scoring snapshots exist. Critical alerts wait for human approval before delivery."
        />
      ) : (
        <section className="space-y-4">
          <div>
            <p className="console-label">Delivery history</p>
            <h2 className="mt-2 font-semibold tracking-tight">Event history</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Latest 100 events. Every alert and brief includes evidence, freshness, and confidence.
            </p>
          </div>
          <AlertEventsTable data={events} />
        </section>
      )}
    </div>
  );
}
