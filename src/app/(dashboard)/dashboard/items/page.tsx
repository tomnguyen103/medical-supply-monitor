import { PageHeader } from "@/components/dashboard/primitives";
import { CatalogBlocked } from "@/components/dashboard/catalog-blocked";
import { ImportPanel } from "@/components/dashboard/import-panel";
import { ItemsTable } from "@/components/dashboard/items-table";
import { CATALOG_LIST_LIMIT, getCatalogContext, listItems } from "@/lib/catalog";
import { importItemsAction } from "@/lib/actions/import";
import { ITEM_CSV_TEMPLATE } from "@/lib/import";

// Tenant-scoped, auth + DB backed: always render per-request.
export const dynamic = "force-dynamic";
export const metadata = { title: "Items" };

export default async function ItemsPage() {
  const ctx = await getCatalogContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Items"
        description={`Latest ${CATALOG_LIST_LIMIT} monitored drugs, devices, and supplies.`}
      />
      {!ctx.ready ? (
        <CatalogBlocked reason={ctx.reason} />
      ) : (
        <>
          <ImportPanel
            action={importItemsAction}
            entityLabel="items"
            template={ITEM_CSV_TEMPLATE}
            templateFilename="items-template.csv"
          />
          <ItemsTable data={await listItems(ctx.orgId)} />
        </>
      )}
    </div>
  );
}
