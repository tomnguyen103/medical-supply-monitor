"use server";

import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { getOrgContext, hasOrgPermission } from "@/lib/auth/tenancy";
import type { OrgContext } from "@/lib/auth/tenancy";
import { seedDemoWorkspace, type DemoWorkspaceSeedResult } from "@/lib/demo/workspace";
import { isDatabaseConfigured } from "@/lib/db";
import { enforceActionRateLimit } from "@/lib/security/rate-limit";

export type DemoWorkspaceActionResult =
  | {
      ok: true;
      message: string;
      inserted: DemoWorkspaceSeedResult["inserted"];
    }
  | {
      ok: false;
      message: string;
    };

export async function seedDemoWorkspaceAction(): Promise<DemoWorkspaceActionResult> {
  if (!isDatabaseConfigured) {
    return { ok: false, message: "Database is not configured." };
  }
  const ctx = await getOrgContext();
  if (!ctx) return { ok: false, message: "No active organization." };
  if (!hasOrgPermission(ctx, "manage_catalog")) {
    return { ok: false, message: "Your organization role cannot seed demo data." };
  }
  const demo = getDemoWorkspaceContext(ctx);
  if (!demo) {
    return {
      ok: false,
      message: "Select a Clerk organization with demo or sandbox in its slug before seeding.",
    };
  }
  const rateLimit = await enforceActionRateLimit(ctx, "seed_demo_workspace");
  if (!rateLimit.ok) {
    return { ok: false, message: rateLimit.error ?? "Too many requests." };
  }

  const result = await seedDemoWorkspace({
    organizationId: demo.orgId,
    organizationName: demo.name,
  });
  if (!result.ok) return { ok: false, message: "Demo workspace seed was skipped." };

  await writeAuditLog({
    organizationId: ctx.orgId,
    actorType: "user",
    actorId: ctx.userId,
    action: "demo_workspace.seed",
    subjectType: "organization",
    subjectId: ctx.orgId,
    summary: "Seeded buyer-ready demo workspace.",
    metadata: {
      inserted: result.inserted,
      rateLimitConfigured: rateLimit.configured,
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/items");
  revalidatePath("/dashboard/suppliers");
  revalidatePath("/dashboard/facilities");
  revalidatePath("/dashboard/signals");
  revalidatePath("/dashboard/alerts");
  return {
    ok: true,
    message: "Demo workspace is ready.",
    inserted: result.inserted,
  };
}

function getDemoWorkspaceContext(
  ctx: Pick<OrgContext, "orgId" | "orgSlug">,
): { orgId: string; name: string } | null {
  const marker = `${ctx.orgSlug ?? ""} ${ctx.orgId}`.toLowerCase();
  if (!/\b(demo|sandbox)\b/.test(marker)) return null;
  return {
    orgId: ctx.orgId,
    name: ctx.orgSlug ? `${ctx.orgSlug} demo workspace` : "Demo Health System",
  };
}
