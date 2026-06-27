"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { getOrgContext, hasOrgPermission } from "@/lib/auth/tenancy";
import { db, isDatabaseConfigured } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { enforceActionRateLimit } from "@/lib/security/rate-limit";

/** Toggle an item's watchlist membership. Tenant-scoped by organization. */
export async function setItemWatched(
  itemId: string,
  watched: boolean,
): Promise<{ ok: boolean; error?: string }> {
  if (!isDatabaseConfigured) return { ok: false, error: "Database is not configured." };
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, error: "No active organization." };
  if (!hasOrgPermission(ctx, "manage_catalog")) {
    return { ok: false, error: "Your organization role cannot update catalog items." };
  }
  const rateLimit = await enforceActionRateLimit(ctx, "set_item_watched");
  if (!rateLimit.ok) return { ok: false, error: rateLimit.error };

  try {
    await db
      .update(items)
      .set({ isWatched: watched })
      // The organizationId predicate is the tenant-isolation boundary.
      .where(and(eq(items.id, itemId), eq(items.organizationId, ctx.orgId)));
    await writeAuditLog({
      organizationId: ctx.orgId,
      actorType: "user",
      actorId: ctx.userId,
      action: "catalog.item.watchlist_update",
      subjectType: "item",
      subjectId: itemId,
      summary: watched ? "Item added to watchlist." : "Item removed from watchlist.",
      metadata: {
        watched,
        rateLimitConfigured: rateLimit.configured,
      },
    });
    revalidatePath("/dashboard/items");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Update failed." };
  }
}
