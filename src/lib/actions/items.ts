"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db, isDatabaseConfigured } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { getOrgContext } from "@/lib/auth/tenancy";

/** Toggle an item's watchlist membership. Tenant-scoped by organization. */
export async function setItemWatched(
  itemId: string,
  watched: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!isDatabaseConfigured) return { ok: false, error: "Database is not configured." };
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: "No active organization." };

  try {
    await db
      .update(items)
      .set({ isWatched: watched })
      // The organizationId predicate is the tenant-isolation boundary.
      .where(and(eq(items.id, itemId), eq(items.organizationId, ctx.orgId)));
    revalidatePath("/dashboard/items");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}
