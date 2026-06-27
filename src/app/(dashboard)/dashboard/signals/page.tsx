import { Radar } from "lucide-react";

import { CatalogBlocked } from "@/components/dashboard/catalog-blocked";
import { PageHeader, EmptyState } from "@/components/dashboard/primitives";
import { SignalsTable } from "@/components/dashboard/signals-table";
import { getCatalogContext } from "@/lib/catalog";
import { listRiskSignals } from "@/lib/signals";

// Tenant-scoped, auth + DB backed: always render per-request.
export const dynamic = "force-dynamic";
export const metadata = { title: "Risk signals" };

export default async function SignalsPage() {
  const ctx = await getCatalogContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Risk signals"
        description="Tenant-matched signals with deterministic scores, freshness, and evidence."
      />
      {!ctx.ready ? (
        <CatalogBlocked reason={ctx.reason} />
      ) : (
        <SignalsContent organizationId={ctx.orgId} />
      )}
    </div>
  );
}

async function SignalsContent({ organizationId }: { organizationId: string }) {
  const signals = await listRiskSignals(organizationId);
  if (signals.length === 0) {
    return (
      <EmptyState
        icon={Radar}
        title="No matched risk signals yet"
        body="Import item identifiers and suppliers, then run the risk refresh job to ingest matched connector signals."
      />
    );
  }
  return <SignalsTable data={signals} />;
}
