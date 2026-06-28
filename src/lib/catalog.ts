import "server-only";
import { and, count, desc, eq } from "drizzle-orm";

import { db, isDatabaseConfigured } from "@/lib/db";
import {
  items,
  suppliers,
  facilities,
  type Item,
  type Supplier,
  type Facility,
} from "@/lib/db/schema";
import { getOrgContext } from "@/lib/auth/tenancy";

export const CATALOG_LIST_LIMIT = 200;

export type CatalogContext =
  | { ready: true; orgId: string }
  | { ready: false; reason: "no-db" | "no-org" };

/**
 * Resolves the tenant context for catalog pages. Returns a `ready: false`
 * reason (instead of throwing) when the database or an active org is missing,
 * so pages can render a setup state rather than crash.
 */
export async function getCatalogContext(): Promise<CatalogContext> {
  if (!isDatabaseConfigured) return { ready: false, reason: "no-db" };
  const ctx = await getOrgContext();
  if (!ctx) return { ready: false, reason: "no-org" };
  return { ready: true, orgId: ctx.orgId };
}

export function listItems(
  organizationId: string,
  limit = CATALOG_LIST_LIMIT,
): Promise<Item[]> {
  return db
    .select()
    .from(items)
    .where(eq(items.organizationId, organizationId))
    .orderBy(desc(items.createdAt), desc(items.id))
    .limit(limit);
}

export function listSuppliers(
  organizationId: string,
  limit = CATALOG_LIST_LIMIT,
): Promise<Supplier[]> {
  return db
    .select()
    .from(suppliers)
    .where(eq(suppliers.organizationId, organizationId))
    .orderBy(desc(suppliers.createdAt), desc(suppliers.id))
    .limit(limit);
}

export function listFacilities(
  organizationId: string,
  limit = CATALOG_LIST_LIMIT,
): Promise<Facility[]> {
  return db
    .select()
    .from(facilities)
    .where(eq(facilities.organizationId, organizationId))
    .orderBy(desc(facilities.createdAt), desc(facilities.id))
    .limit(limit);
}

export async function getCatalogCounts(organizationId: string) {
  const [itemRows, supplierRows, facilityRows, watchedRows] = await Promise.all([
    db.select({ v: count() }).from(items).where(eq(items.organizationId, organizationId)),
    db
      .select({ v: count() })
      .from(suppliers)
      .where(eq(suppliers.organizationId, organizationId)),
    db
      .select({ v: count() })
      .from(facilities)
      .where(eq(facilities.organizationId, organizationId)),
    db
      .select({ v: count() })
      .from(items)
      .where(and(eq(items.organizationId, organizationId), eq(items.isWatched, true))),
  ]);
  return {
    items: itemRows[0]?.v ?? 0,
    suppliers: supplierRows[0]?.v ?? 0,
    facilities: facilityRows[0]?.v ?? 0,
    watched: watchedRows[0]?.v ?? 0,
  };
}
