"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { runAlertEvaluation } from "@/lib/alerts/engine";
import { getOrgContext } from "@/lib/auth/tenancy";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  alertChannelEnum,
  alertRules,
  riskDomainEnum,
  severityEnum,
} from "@/lib/db/schema";
import type { AlertChannel } from "@/lib/alerts/types";

export async function createAlertRuleAction(
  formData: FormData,
): Promise<void> {
  if (!isDatabaseConfigured) return;
  const ctx = await getOrgContext();
  if (!ctx) return;

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const domain = parseDomain(formData.get("domain"));
  const minSeverity = parseSeverity(formData.get("minSeverity")) ?? "high";
  const channels = parseChannels(formData.getAll("channels"));
  const cooldownMinutes = parsePositiveInt(formData.get("cooldownMinutes"), 720);
  const requireApprovalForCritical =
    formData.get("requireApprovalForCritical") === "on";

  await db.insert(alertRules).values({
    organizationId: ctx.orgId,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    domain,
    minSeverity,
    channels,
    cooldownMinutes,
    requireApprovalForCritical,
    createdBy: ctx.userId,
  });
  revalidatePath("/dashboard/alerts");
}

export async function setAlertRuleEnabledAction(
  ruleId: string,
  enabled: boolean,
): Promise<void> {
  if (!isDatabaseConfigured) return;
  const ctx = await getOrgContext();
  if (!ctx) return;

  await db
    .update(alertRules)
    .set({ enabled })
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.organizationId, ctx.orgId)));
  revalidatePath("/dashboard/alerts");
}

export async function deleteAlertRuleAction(ruleId: string): Promise<void> {
  if (!isDatabaseConfigured) return;
  const ctx = await getOrgContext();
  if (!ctx) return;

  await db
    .delete(alertRules)
    .where(and(eq(alertRules.id, ruleId), eq(alertRules.organizationId, ctx.orgId)));
  revalidatePath("/dashboard/alerts");
}

export async function runAlertEvaluationAction(): Promise<void> {
  await runAlertEvaluation();
  revalidatePath("/dashboard/alerts");
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
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
