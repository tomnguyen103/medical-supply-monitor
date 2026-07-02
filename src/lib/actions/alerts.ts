"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { writeAuditLog } from "@/lib/audit";
import {
  approveAlertEventForDelivery,
  rejectAlertEventForDelivery,
  runAlertEvaluationForOrganization,
} from "@/lib/alerts/engine";
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

export interface AlertActionOutcome {
  ok: boolean;
  message: string;
}

function failure(message: string): AlertActionOutcome {
  return { ok: false, message };
}

/** Shared guards: returns the org context or an outcome to short-circuit on. */
async function ready(
  permission: "manage_alerts" | "run_operations",
  action: string,
): Promise<{ ctx: OrgContext } | { outcome: AlertActionOutcome }> {
  if (!isDatabaseConfigured) {
    return { outcome: failure("Database is not configured.") };
  }
  const ctx = await getOrgContext();
  if (!ctx) {
    return { outcome: failure("Sign in and select an organization first.") };
  }
  if (!hasOrgPermission(ctx, permission)) {
    return { outcome: failure("Your organization role cannot perform this action.") };
  }
  const rateLimit = await enforceActionRateLimit(ctx, action);
  if (!rateLimit.ok) {
    return { outcome: failure(rateLimit.error ?? "Too many requests.") };
  }
  return { ctx };
}

export async function createAlertRuleAction(
  formData: FormData,
): Promise<AlertActionOutcome> {
  const gate = await ready("manage_alerts", "create_alert_rule");
  if ("outcome" in gate) return gate.outcome;
  const { ctx } = gate;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return failure("Rule name is required.");

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
  return { ok: true, message: `Alert rule "${name}" created.` };
}

export async function setAlertRuleEnabledAction(
  ruleId: string,
  enabled: boolean,
): Promise<AlertActionOutcome> {
  const gate = await ready("manage_alerts", "set_alert_rule_enabled");
  if ("outcome" in gate) return gate.outcome;
  const { ctx } = gate;

  const [row] = await db
    .update(alertRules)
    .set({ enabled })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.organizationId, ctx.orgId)))
    .returning({ id: alertRules.id });
  if (!row) return failure("Alert rule not found.");

  await auditAlertAction(ctx, "alerts.rule.enabled_update", ruleId, { enabled });
  revalidatePath("/dashboard/alerts");
  return { ok: true, message: enabled ? "Alert rule enabled." : "Alert rule disabled." };
}

export async function updateAlertRuleAction(
  ruleId: string,
  formData: FormData,
): Promise<AlertActionOutcome> {
  const gate = await ready("manage_alerts", "update_alert_rule");
  if ("outcome" in gate) return gate.outcome;
  const { ctx } = gate;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return failure("Rule name is required.");
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
  if (!row) return failure("Alert rule not found.");

  await auditAlertAction(ctx, "alerts.rule.update", ruleId, {
    name,
    domain,
    minSeverity,
    channels,
  });
  revalidatePath("/dashboard/alerts");
  return { ok: true, message: `Alert rule "${name}" updated.` };
}

export async function deleteAlertRuleAction(ruleId: string): Promise<AlertActionOutcome> {
  const gate = await ready("manage_alerts", "delete_alert_rule");
  if ("outcome" in gate) return gate.outcome;
  const { ctx } = gate;

  const [row] = await db
    .delete(alertRules)
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.organizationId, ctx.orgId)))
    .returning({ id: alertRules.id });
  if (!row) return failure("Alert rule not found.");

  await auditAlertAction(ctx, "alerts.rule.delete", ruleId);
  revalidatePath("/dashboard/alerts");
  return { ok: true, message: "Alert rule deleted." };
}

export async function runAlertEvaluationAction(): Promise<AlertActionOutcome> {
  const gate = await ready("run_operations", "run_alert_evaluation");
  if ("outcome" in gate) return gate.outcome;
  const { ctx } = gate;

  const result = await runAlertEvaluationForOrganization(ctx.orgId);
  await auditAlertAction(ctx, "alerts.evaluate", ctx.orgId, {
    events: result.events,
    briefs: result.briefs,
    failed: result.failed,
  });
  revalidatePath("/dashboard/alerts");
  return {
    ok: result.ok,
    message: result.ok
      ? `Evaluated ${result.rules} rule(s), ${result.events} event(s).`
      : `Evaluation completed with ${result.failed} failure(s).`,
  };
}

export async function approveAlertEventAction(eventId: string): Promise<AlertActionOutcome> {
  const gate = await ready("manage_alerts", "approve_alert_event");
  if ("outcome" in gate) return gate.outcome;
  const { ctx } = gate;

  const result = await approveAlertEventForDelivery({
    organizationId: ctx.orgId,
    eventId,
    actorId: ctx.userId,
  });
  await auditAlertAction(ctx, "alerts.event.approve", eventId, result);
  revalidatePath("/dashboard/alerts");
  if (!result.ok) {
    return failure(
      result.reason === "not-found"
        ? "Alert event not found."
        : "Alert event is not awaiting approval.",
    );
  }
  return {
    ok: true,
    message:
      result.status === "approved" && result.error
        ? `Approved, but delivery reported: ${result.error}`
        : "Alert approved and delivered.",
  };
}

export async function rejectAlertEventAction(eventId: string): Promise<AlertActionOutcome> {
  const gate = await ready("manage_alerts", "reject_alert_event");
  if ("outcome" in gate) return gate.outcome;
  const { ctx } = gate;

  const result = await rejectAlertEventForDelivery({
    organizationId: ctx.orgId,
    eventId,
    actorId: ctx.userId,
  });
  await auditAlertAction(ctx, "alerts.event.reject", eventId, result);
  revalidatePath("/dashboard/alerts");
  if (!result.ok) {
    return failure(
      result.reason === "not-found"
        ? "Alert event not found."
        : "Alert event is not awaiting approval.",
    );
  }
  return { ok: true, message: "Alert rejected." };
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
