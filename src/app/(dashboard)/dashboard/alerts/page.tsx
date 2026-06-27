import { Bell } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/dashboard/primitives";

export const metadata = { title: "Alerts" };

export default function AlertsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Alerts"
        description="Alert rules and delivery history, each with evidence, freshness, and confidence."
      />
      <EmptyState
        icon={Bell}
        title="No alerts yet"
        body="Phase 5 adds alert rules, cooldowns, and Slack / email delivery. Critical alerts require human approval before they are sent."
      />
    </div>
  );
}
