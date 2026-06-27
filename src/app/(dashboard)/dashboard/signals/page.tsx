import { Radar } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/dashboard/primitives";

export const metadata = { title: "Risk signals" };

export default function SignalsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Risk signals"
        description="Normalized signals from every connector, with freshness and evidence."
      />
      <EmptyState
        icon={Radar}
        title="No risk signals yet"
        body="Phase 3 connects openFDA shortages and recalls, then external risk feeds. Each provider normalizes into one RiskSignal model and appears here after ingestion."
      />
    </div>
  );
}
