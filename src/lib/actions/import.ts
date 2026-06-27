"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";

import { db, isDatabaseConfigured } from "@/lib/db";
import { items, itemIdentifiers, suppliers, facilities } from "@/lib/db/schema";
import { getOrgContext } from "@/lib/auth/tenancy";
import {
  parseCsv,
  validateItemRows,
  validateSupplierRows,
  validateFacilityRows,
  type RowError,
} from "@/lib/import";

export interface ImportOutcome {
  ok: boolean;
  message: string;
  inserted: number;
  skipped: number;
  errors: RowError[];
}

const MAX_BYTES = 2_000_000;

function failure(message: string, errors: RowError[] = []): ImportOutcome {
  return { ok: false, message, inserted: 0, skipped: 0, errors };
}

async function readCsv(
  formData: FormData,
): Promise<{ text: string } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to import." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "File is too large (2 MB maximum)." };
  }
  return { text: await file.text() };
}

/** Shared guards: returns the orgId or an outcome to short-circuit on. */
async function ready(): Promise<{ orgId: string } | { outcome: ImportOutcome }> {
  if (!isDatabaseConfigured) {
    return { outcome: failure("Database is not configured. Set DATABASE_URL to enable imports.") };
  }
  const ctx = await getOrgContext();
  if (!ctx) {
    return { outcome: failure("Sign in and select an organization before importing.") };
  }
  return { orgId: ctx.orgId };
}

export async function importItemsAction(
  _prev: ImportOutcome | null,
  formData: FormData,
): Promise<ImportOutcome> {
  const gate = await ready();
  if ("outcome" in gate) return gate.outcome;
  const read = await readCsv(formData);
  if ("error" in read) return failure(read.error);

  const { valid, errors } = validateItemRows(parseCsv(read.text).rows);
  if (valid.length === 0) return failure("No valid rows found in the file.", errors);

  try {
    const skus = [
      ...new Set(
        valid
          .map((row) => row.internalSku)
          .filter((sku): sku is string => Boolean(sku)),
      ),
    ];
    const existingItems =
      skus.length > 0
        ? await db
            .select({ id: items.id, internalSku: items.internalSku })
            .from(items)
            .where(and(eq(items.organizationId, gate.orgId), inArray(items.internalSku, skus)))
        : [];
    const existingBySku = new Map(
      existingItems
        .filter((row) => row.internalSku)
        .map((row) => [row.internalSku!, row.id]),
    );

    const itemRows = valid.map((v) => {
      const { identifiers, ...item } = v;
      const existingId = v.internalSku ? existingBySku.get(v.internalSku) : undefined;
      return {
        id: existingId ?? randomUUID(),
        wasExisting: Boolean(existingId),
        identifiers,
        item: { organizationId: gate.orgId, ...item },
      };
    });
    const newItemRows = itemRows.filter((row) => !row.wasExisting);

    let inserted: Array<{ id: string }> = [];
    if (newItemRows.length > 0) {
      const insertedRows = await db
        .insert(items)
        .values(newItemRows.map((row) => ({ id: row.id, ...row.item })))
        .onConflictDoNothing()
        .returning({ id: items.id });
      inserted = insertedRows;
    }

    const refreshedItems =
      skus.length > 0
        ? await db
            .select({ id: items.id, internalSku: items.internalSku })
            .from(items)
            .where(and(eq(items.organizationId, gate.orgId), inArray(items.internalSku, skus)))
        : [];
    const resolvedBySku = new Map(
      refreshedItems
        .filter((row) => row.internalSku)
        .map((row) => [row.internalSku!, row.id]),
    );
    const insertedIds = new Set(inserted.map((row) => row.id));
    const identifierRows = itemRows.flatMap((row) => {
      const resolvedItemId =
        row.item.internalSku != null
          ? resolvedBySku.get(row.item.internalSku)
          : insertedIds.has(row.id)
            ? row.id
            : undefined;
      if (!resolvedItemId) return [];
      return row.identifiers.map((identifier) => ({
        organizationId: gate.orgId,
        itemId: resolvedItemId,
        type: identifier.type,
        value: identifier.value,
        isPrimary: identifier.isPrimary,
      }));
    });

    if (identifierRows.length > 0) {
      await db
        .insert(itemIdentifiers)
        .values(identifierRows)
        .onConflictDoNothing();
    }

    revalidatePath("/dashboard/items");
    revalidatePath("/dashboard/signals");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Imported ${inserted.length} item(s).`,
      inserted: inserted.length,
      skipped: valid.length - inserted.length,
      errors,
    };
  } catch (e) {
    return failure(e instanceof Error ? e.message : "Import failed.", errors);
  }
}

export async function importSuppliersAction(
  _prev: ImportOutcome | null,
  formData: FormData,
): Promise<ImportOutcome> {
  const gate = await ready();
  if ("outcome" in gate) return gate.outcome;
  const read = await readCsv(formData);
  if ("error" in read) return failure(read.error);

  const { valid, errors } = validateSupplierRows(parseCsv(read.text).rows);
  if (valid.length === 0) return failure("No valid rows found in the file.", errors);

  try {
    const inserted = await db
      .insert(suppliers)
      .values(valid.map((v) => ({ organizationId: gate.orgId, ...v })))
      .onConflictDoNothing()
      .returning({ id: suppliers.id });
    revalidatePath("/dashboard/suppliers");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Imported ${inserted.length} supplier(s).`,
      inserted: inserted.length,
      skipped: valid.length - inserted.length,
      errors,
    };
  } catch (e) {
    return failure(e instanceof Error ? e.message : "Import failed.", errors);
  }
}

export async function importFacilitiesAction(
  _prev: ImportOutcome | null,
  formData: FormData,
): Promise<ImportOutcome> {
  const gate = await ready();
  if ("outcome" in gate) return gate.outcome;
  const read = await readCsv(formData);
  if ("error" in read) return failure(read.error);

  const { valid, errors } = validateFacilityRows(parseCsv(read.text).rows);
  if (valid.length === 0) return failure("No valid rows found in the file.", errors);

  try {
    const inserted = await db
      .insert(facilities)
      .values(valid.map((v) => ({ organizationId: gate.orgId, ...v })))
      .onConflictDoNothing()
      .returning({ id: facilities.id });
    revalidatePath("/dashboard/facilities");
    revalidatePath("/dashboard");
    return {
      ok: true,
      message: `Imported ${inserted.length} facilit${inserted.length === 1 ? "y" : "ies"}.`,
      inserted: inserted.length,
      skipped: valid.length - inserted.length,
      errors,
    };
  } catch (e) {
    return failure(e instanceof Error ? e.message : "Import failed.", errors);
  }
}
