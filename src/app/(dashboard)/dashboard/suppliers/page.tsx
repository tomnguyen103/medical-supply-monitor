import { Factory } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Suppliers" };

export default function SuppliersPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Suppliers"
        description="Supplier exposure: manufacturers, distributors, sites, and sole-source risk."
      />
      <EmptyState
        icon={Factory}
        title="No suppliers yet"
        body="Phase 2 adds suppliers, supplier sites, and item-to-supplier exposure with sole-source and lead-time flags."
      >
        <Button disabled>Import suppliers (Phase 2)</Button>
      </EmptyState>
    </div>
  );
}
