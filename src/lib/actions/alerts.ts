"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import { runAlertEvaluationForOrganization } from "@/lib/alerts/engine";
import { getOrgContext, hasOrgPermission, type OrgContext } from "@/lib/auth/tenancy";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  alertChannelEnum,
  alertRules,
  riskDomainEnum,
  severityEnum,
} from "@/lib/db/schema";
import type { AlertChannel } from "@/lib/alerts/types";
import { enforceActionRateLimit } from "@/lib/security/rate-limit";

export async function createAlertRuleAction(
  formData: FormData,
): Promise<void> {
  const ctx = await ready("manage_alerts", "create_alert_rule");
  if (!ctx) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const domain = parseDomain(formData.get("domain"));
  const minSeverity = parseSeverity(formData.get("minSeverity")) ?? "high";
  const channels = parseChannels(formData.getAll("channels"));
  const cooldownMinutes = parsePositiveInt(formData.get("cooldownMinutes"), 720);
  const requireApprovalForCritical =
    formData.get("requireApprovalForCritical") === "on";

  const [row] = await db
    .insert(alertRules)
    .values({
      organizationId: ctx.orgId,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      domain,
      minSeverity,
      channels,
      cooldownMinutes,
      requireApprovalForCritical,
      createdBy: ctx.userId,
    })
    .returning({ id: alertRules.id });
  await auditAlertAction(ctx, "alerts.rule.create", row?.id, {
    name,
    domain,
    minSeverity,
    channels,
  });
  revalidatePath("/dashboard/alerts");
}

export async function setAlertRuleEnabledAction(
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  const ctx = await ready("manage_alerts", "set_alert_rule_enabled");
  if (!ctx) return;

  const [row] = await db
    .update(alertRules)
    .set({ enabled })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.organizationId, ctx.orgId)))
    .returning({ id: alertRules.id });
  if (row) {
    await auditAlertAction(ctx, "alerts.rule.enabled_update", ruleId, { enabled });
  }
  revalidatePath("/dashboard/alerts");
}

export async function updateAlertRuleAction(
  ruleId: string,
  formData: FormData,
): Promise<void> {
  const ctx = await ready("manage_alerts", "update_alert_rule");
  if (!ctx) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const domain = parseDomain(formData.get("domain"));
  const minSeverity = parseSeverity(formData.get("minSeverity")) ?? "high";
  const channels = parseChannels(formData.getAll("channels"));
  const cooldownMinutes = parsePositiveInt(formData.get("cooldownMinutes"), 720);
  const requireApprovalForCritical =
    formData.get("requireApprovalForCritical") === "on";

  const [row] = await db
    .update(alertRules)
    .set({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      domain,
      minSeverity,
      channels,
      cooldownMinutes,
      requireApprovalForCritical,
    })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.organizationId, ctx.orgId)))
    .returning({ id: alertRules.id });
  if (row) {
    await auditAlertAction(ctx, "alerts.rule.update", ruleId, {
      name,
      domain,
      minSeverity,
      channels,
    });
  }
  revalidatePath("/dashboard/alerts");
}

export async function deleteAlertRuleAction(ruleId: string): Promise<void> {
  const ctx = await ready("manage_alerts", "delete_alert_rule");
  if (!ctx) return;

  const [row] = await db
    .delete(alertRules)
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.organizationId, ctx.orgId)))
    .returning({ id: alertRules.id });
  if (row) {
    await auditAlertAction(ctx, "alerts.rule.delete", ruleId);
  }
  revalidatePath("/dashboard/alerts");
}

export async function runAlertEvaluationAction(): Promise<void> {
  const ctx = await ready("run_operations", "run_alert_evaluation");
  if (!ctx) return;
  const result = await runAlertEvaluationForOrganization(ctx.orgId);
  await auditAlertAction(ctx, "alerts.evaluate", ctx.orgId, {
    events: result.events,
    briefs: result.briefs,
    failed: result.failed,
  });
  revalidatePath("/dashboard/alerts");
}

async function ready(
  permission: "manage_alerts" | "run_operations",
  action: string,
): Promise<OrgContext | null> {
  if (!isDatabaseConfigured) return null;
  const ctx = await getOrgContext();
  if (!ctx || !hasOrgPermission(ctx, permission)) return null;
  const rateLimit = await enforceActionRateLimit(ctx, action);
  return rateLimit.ok ? ctx : null;
}

async function auditAlertAction(
  ctx: OrgContext,
  action: string,
  subjectId: string | null | undefined,
  metadata: Record<string, unknown> = {},
) {
  await writeAuditLog({
    organizationId: ctx.orgId,
    actorType: "user",
    actorId: ctx.userId,
    action,
    subjectType: "alert",
    subjectId,
    summary: action,
    metadata,
  });
}

function parseDomain(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value === "" || value === "all") return null;
  return (riskDomainEnum.enumValues as readonly string[]).includes(value)
    ? (value as (typeof riskDomainEnum.enumValues)[number])
    : null;
}

function parseSeverity(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  return (severityEnum.enumValues as readonly string[]).includes(value)
    ? (value as (typeof severityEnum.enumValues)[number])
    : null;
}

function parseChannels(values: FormDataEntryValue[]): AlertChannel[] {
  const channels: AlertChannel[] = [];
  for (const value of values) {
    if (
      typeof value === "string" &&
      (alertChannelEnum.enumValues as readonly string[]).includes(value)
    ) {
      channels.push(value as AlertChannel);
    }
  }
  return channels.length > 0 ? channels : ["in_app"];
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number) {
  if (typeof value !== "string") return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 2_147_483_647
    ? parsed
    : fallback;
}
