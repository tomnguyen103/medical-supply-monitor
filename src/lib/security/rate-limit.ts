import type { OrgContext } from "@/lib/auth/tenancy";
import { checkRateLimit } from "@/lib/redis";

export interface ActionRateLimitResult {
  ok: boolean;
  configured: boolean;
  error?: string;
}

export async function enforceActionRateLimit(
  ctx: Pick<OrgContext, "orgId" | "userId">,
  action: string,
): Promise<ActionRateLimitResult> {
  const key = ["action", action, ctx.orgId, ctx.userId].join(":");
  const result = await checkRateLimit(key);
  if (result.success) {
    return { ok: true, configured: result.configured };
  }
  return {
    ok: false,
    configured: result.configured,
    error: "Too many requests. Wait a minute and try again.",
  };
}
