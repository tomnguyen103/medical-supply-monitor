import "server-only";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db, isDatabaseConfigured } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { integrations } from "@/lib/env";

/**
 * Tenant context derived from Clerk. The active organization id IS the tenant
 * boundary: every business query must be filtered by `orgId`.
 *
 * Guardrail: tenant access is owned by Clerk + these helpers — never by AI.
 */
export interface OrgContext {
  userId: string;
  orgId: string;
  orgRole: string | null;
  orgSlug: string | null;
}

export type OrgPermission =
  | "view"
  | "manage_catalog"
  | "manage_alerts"
  | "run_operations"
  | "manage_settings";

const ADMIN_ROLES = new Set(["admin", "owner", "org:admin", "org:owner"]);
const OPERATOR_ROLES = new Set([
  ...ADMIN_ROLES,
  "member",
  "org:member",
  "operator",
  "org:operator",
]);

/**
 * Active org context, or null when: Clerk is unconfigured, the user is signed
 * out, or no organization is selected. Never throws on the unconfigured path,
 * so server components can render a "set up Clerk / pick an org" state.
 */
export async function getOrgContext(): Promise<OrgContext | null> {
  if (!integrations.clerk) return null;
  const { userId, orgId, orgRole, orgSlug } = await auth();
  if (!userId || !orgId) return null;
  if (isDatabaseConfigured) {
    await ensureOrganization(orgId, orgSlug ?? null);
  }
  return { userId, orgId, orgRole: orgRole ?? null, orgSlug: orgSlug ?? null };
}

/**
 * Lazily mirrors a Clerk organization into our `organizations` table.
 * Checked on every authenticated hit (one indexed PK lookup) but only
 * written once, on the first hit for a given org — see A2 in the
 * health-audit findings register. Never throws: a DB or Clerk-API hiccup
 * here must not block sign-in.
 */
async function ensureOrganization(orgId: string, orgSlug: string | null): Promise<void> {
  try {
    const existing = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    if (existing.length > 0) return;

    let name = orgSlug ?? orgId;
    let slug = orgSlug;
    try {
      const client = await clerkClient();
      const org = await client.organizations.getOrganization({ organizationId: orgId });
      name = org.name || name;
      slug = org.slug || slug;
    } catch (error) {
      console.error(
        `[tenancy] failed to fetch organization ${orgId} from Clerk; falling back to slug/id as name`,
        error,
      );
    }

    await db.insert(organizations).values({ id: orgId, name, slug }).onConflictDoNothing();
  } catch (error) {
    console.error(`[tenancy] failed to ensure organization row for ${orgId}`, error);
  }
}

/**
 * Enforces an active organization. Throws when there is none — use in server
 * actions and route handlers that must be tenant-scoped.
 */
export async function requireOrgContext(): Promise<OrgContext> {
  const ctx = await getOrgContext();
  if (!ctx) {
    throw new Error(
      "No active organization context. Sign in and select an organization first.",
    );
  }
  return ctx;
}

export function hasOrgPermission(
  ctx: Pick<OrgContext, "orgRole">,
  permission: OrgPermission,
): boolean {
  if (permission === "view") return true;
  const role = normalizeOrgRole(ctx.orgRole);
  if (!role) return false;
  if (permission === "manage_settings") return ADMIN_ROLES.has(role);
  return OPERATOR_ROLES.has(role);
}

export function requireOrgPermission(
  ctx: OrgContext,
  permission: OrgPermission,
): void {
  if (!hasOrgPermission(ctx, permission)) {
    throw new Error(`Organization role ${ctx.orgRole ?? "unknown"} cannot ${permission}.`);
  }
}

function normalizeOrgRole(role: string | null): string | null {
  if (!role) return null;
  return role.trim().toLowerCase();
}
