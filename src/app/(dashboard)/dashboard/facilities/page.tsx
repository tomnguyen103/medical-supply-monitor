import { PageHeader } from "@/components/dashboard/primitives";
import { CatalogBlocked } from "@/components/dashboard/catalog-blocked";
import { ImportPanel } from "@/components/dashboard/import-panel";
import { FacilitiesTable } from "@/components/dashboard/facilities-table";
import { CATALOG_LIST_LIMIT, getCatalogContext, listFacilities } from "@/lib/catalog";
import { importFacilitiesAction } from "@/lib/actions/import";
import { FACILITY_CSV_TEMPLATE } from "@/lib/import";

// Tenant-scoped, auth + DB backed: always render per-request.
export const dynamic = "force-dynamic";
export const metadata = { title: "Facilities" };

export default async function FacilitiesPage() {
  const ctx = await getCatalogContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Facilities"
        description={`Latest ${CATALOG_LIST_LIMIT} monitored hospitals, clinics, pharmacies, and warehouses.`}
      />
      {!ctx.ready ? (
        <CatalogBlocked reason={ctx.reason} />
      ) : (
        <>
          <ImportPanel
            action={importFacilitiesAction}
            entityLabel="facilities"
            template={FACILITY_CSV_TEMPLATE}
            templateFilename="facilities-template.csv"
          />
          <FacilitiesTable data={await listFacilities(ctx.orgId)} />
        </>
      )}
    </div>
  );
}
