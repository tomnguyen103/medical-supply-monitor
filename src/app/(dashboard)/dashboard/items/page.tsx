import { Boxes } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Items" };

export default function ItemsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Items"
        description="Your monitored catalog of critical drugs, devices, and supplies."
      />
      <EmptyState
        icon={Boxes}
        title="No items yet"
        body="Phase 2 adds CSV import for your item master, identifiers, criticality, and watchlists."
      >
        <Button disabled>Import CSV (Phase 2)</Button>
      </EmptyState>
    </div>
  );
}
