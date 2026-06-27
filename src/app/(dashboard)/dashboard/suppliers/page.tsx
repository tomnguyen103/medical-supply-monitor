import { PageHeader } from "@/components/dashboard/primitives";
import { CatalogBlocked } from "@/components/dashboard/catalog-blocked";
import { ImportPanel } from "@/components/dashboard/import-panel";
import { SuppliersTable } from "@/components/dashboard/suppliers-table";
import { getCatalogContext, listSuppliers } from "@/lib/catalog";
import { importSuppliersAction } from "@/lib/actions/import";
import { SUPPLIER_CSV_TEMPLATE } from "@/lib/import";

// Tenant-scoped, auth + DB backed: always render per-request.
export const dynamic = "force-dynamic";
export const metadata = { title: "Suppliers" };

export default async function SuppliersPage() {
  const ctx = await getCatalogContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Suppliers"
        description="Supplier exposure: manufacturers, distributors, and sourcing risk."
      />
      {!ctx.ready ? (
        <CatalogBlocked reason={ctx.reason} />
      ) : (
        <>
          <ImportPanel
            action={importSuppliersAction}
            entityLabel="suppliers"
            template={SUPPLIER_CSV_TEMPLATE}
            templateFilename="suppliers-template.csv"
          />
          <SuppliersTable data={await listSuppliers(ctx.orgId)} />
        </>
      )}
    </div>
  );
}
