import "server-only";
import { auth } from "@clerk/nextjs/server";

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
  return { userId, orgId, orgRole: orgRole ?? null, orgSlug: orgSlug ?? null };
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
