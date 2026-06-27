import "server-only";

import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  buildAlertPayload,
  buildDailyBriefPayload,
  SEVERITY_RANK,
  snapshotMatchesRule,
  type AlertPayload,
  type AlertRuleLike,
  type SnapshotLike,
} from "@/lib/alerts/core";
import { deliverAlert } from "@/lib/alerts/delivery";
import type { AlertChannel } from "@/lib/alerts/types";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  alertEvents,
  alertRules,
  humanReviewTasks,
  items,
  organizations,
  riskSnapshots,
} from "@/lib/db/schema";
import { tryGetRedis } from "@/lib/redis";

export interface AlertEvaluationOptions {
  asOf?: Date;
}

export interface AlertEvaluationSummary {
  ok: boolean;
  skipped?: "database-unconfigured";
  tenants: number;
  rules: number;
  events: number;
  briefs: number;
  sent: number;
  suppressed: number;
  awaitingApproval: number;
  failed: number;
}

type RuleRow = AlertRuleLike & {
  channels: AlertChannel[];
  cooldownMinutes: number;
  requireApprovalForCritical: boolean;
};

export async function runAlertEvaluation(
  options: AlertEvaluationOptions = {},
): Promise<AlertEvaluationSummary> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      skipped: "database-unconfigured",
      tenants: 0,
      rules: 0,
      events: 0,
      briefs: 0,
      sent: 0,
      suppressed: 0,
      awaitingApproval: 0,
      failed: 0,
    };
  }

  const asOf = options.asOf ?? new Date();
  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  const totals = emptySummary();

  for (const org of orgRows) {
    const tenant = await evaluateTenantAlerts(org.id, asOf);
    totals.rules += tenant.rules;
    totals.events += tenant.events;
    totals.briefs += tenant.briefs;
    totals.sent += tenant.sent;
    totals.suppressed += tenant.suppressed;
    totals.awaitingApproval += tenant.awaitingApproval;
    totals.failed += tenant.failed;
  }

  return {
    ok: totals.failed === 0,
    tenants: orgRows.length,
    ...totals,
  };
}

export async function runAlertEvaluationForOrganization(
  organizationId: string,
  options: AlertEvaluationOptions = {},
): Promise<AlertEvaluationSummary> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      skipped: "database-unconfigured",
      tenants: 0,
      rules: 0,
      events: 0,
      briefs: 0,
      sent: 0,
      suppressed: 0,
      awaitingApproval: 0,
      failed: 0,
    };
  }

  const asOf = options.asOf ?? new Date();
  const tenant = await evaluateTenantAlerts(organizationId, asOf);
  return {
    ok: tenant.failed === 0,
    tenants: 1,
    ...tenant,
  };
}

async function evaluateTenantAlerts(organizationId: string, asOf: Date) {
  const [rules, snapshots] = await Promise.all([
    loadEnabledRules(organizationId),
    loadLatestSnapshots(organizationId),
  ]);
  const totals = emptySummary();
  totals.rules = rules.length;

  const brief = await createDailyBriefEvent(organizationId, snapshots, asOf);
  applyOutcome(totals, brief);
  if (brief.created) totals.briefs += 1;

  for (const rule of rules) {
    for (const snapshot of snapshots) {
      if (!snapshotMatchesRule(snapshot, rule)) continue;
      const payload = buildAlertPayload(snapshot, rule);
      const channels: AlertChannel[] =
        rule.channels.length > 0 ? rule.channels : ["in_app"];
      for (const channel of channels) {
        const outcome = await createRuleAlertEvent({
          organizationId,
          rule,
          snapshot,
          payload,
          channel,
          asOf,
        });
        applyOutcome(totals, outcome);
      }
    }
  }

  return totals;
}

async function loadEnabledRules(organizationId: string): Promise<RuleRow[]> {
  return db
    .select({
      id: alertRules.id,
      name: alertRules.name,
      domain: alertRules.domain,
      minSeverity: alertRules.minSeverity,
      channels: alertRules.channels,
      cooldownMinutes: alertRules.cooldownMinutes,
      requireApprovalForCritical: alertRules.requireApprovalForCritical,
    })
    .from(alertRules)
    .where(and(eq(alertRules.organizationId, organizationId), eq(alertRules.enabled, true)))
    .orderBy(desc(alertRules.createdAt));
}

async function loadLatestSnapshots(organizationId: string): Promise<SnapshotLike[]> {
  const latestSnapshot = db
    .select({
      itemId: riskSnapshots.itemId,
      computedAt: sql<Date>`max(${riskSnapshots.computedAt})`.as("computed_at"),
    })
    .from(riskSnapshots)
    .where(eq(riskSnapshots.organizationId, organizationId))
    .groupBy(riskSnapshots.itemId)
    .as("latest_snapshot");

  const rows = await db
    .select({
      id: riskSnapshots.id,
      itemId: riskSnapshots.itemId,
      itemName: items.name,
      scoringVersion: riskSnapshots.scoringVersion,
      riskScore: riskSnapshots.riskScore,
      riskLevel: riskSnapshots.riskLevel,
      confidence: riskSnapshots.confidence,
      stalenessStatus: riskSnapshots.stalenessStatus,
      computedAt: riskSnapshots.computedAt,
      components: riskSnapshots.components,
      inputs: riskSnapshots.inputs,
      changeSummary: riskSnapshots.changeSummary,
    })
    .from(riskSnapshots)
    .innerJoin(
      latestSnapshot,
      and(
        eq(riskSnapshots.itemId, latestSnapshot.itemId),
        eq(riskSnapshots.computedAt, latestSnapshot.computedAt),
      ),
    )
    .innerJoin(
      items,
      and(eq(riskSnapshots.itemId, items.id), eq(items.organizationId, organizationId)),
    )
    .where(eq(riskSnapshots.organizationId, organizationId))
    .orderBy(desc(riskSnapshots.computedAt));
  return rows;
}

async function createRuleAlertEvent({
  organizationId,
  rule,
  snapshot,
  payload,
  channel,
  asOf,
}: {
  organizationId: string;
  rule: RuleRow;
  snapshot: SnapshotLike;
  payload: AlertPayload;
  channel: AlertChannel;
  asOf: Date;
}): Promise<EventOutcome> {
  const dedupeKey = stableKey(
    "rule-alert",
    organizationId,
    rule.id,
    snapshot.id,
    channel,
  );
  const requiresApproval =
    snapshot.riskLevel === "critical" && rule.requireApprovalForCritical;
  const outcome = await insertAlertEvent({
      organizationId,
      ruleId: rule.id,
      itemId: snapshot.itemId,
      snapshotId: snapshot.id,
      severity: snapshot.riskLevel,
      channel,
      status: "queued",
      title: payload.title,
      body: payload.body,
      evidence: payload.evidence,
      freshness: payload.freshness,
      confidence: payload.confidence,
      dedupeKey,
      requiresApproval,
      asOf,
    });
  if (!outcome.eventId) return outcome;

  const cooldown = await reserveCooldown({
    organizationId,
    itemId: snapshot.itemId,
    ruleId: rule.id,
    channel,
    riskLevel: snapshot.riskLevel,
    cooldownMinutes: rule.cooldownMinutes,
  });
  if (cooldown.suppressed) {
    await updateAlertEventStatus({
      organizationId,
      eventId: outcome.eventId,
      status: "suppressed",
      error: "Cooldown active.",
      asOf,
    });
    return { ...outcome, suppressed: 1 };
  }

  if (requiresApproval) {
    await updateAlertEventStatus({
      organizationId,
      eventId: outcome.eventId,
      status: "awaiting_approval",
      asOf,
    });
    await createHumanApprovalTask({
      organizationId,
      alertEventId: outcome.eventId,
      snapshot,
      payload,
    });
    return { ...outcome, awaitingApproval: 1 };
  }

  const delivery = await deliverAlert({ channel, title: payload.title, body: payload.body });
  const status =
    delivery.status === "sent"
      ? "sent"
      : delivery.status === "suppressed"
        ? "suppressed"
        : "failed";
  await updateAlertEventStatus({
    organizationId,
    eventId: outcome.eventId,
    status,
    error: delivery.error,
    asOf,
  });

  return {
    ...outcome,
    sent: status === "sent" ? 1 : 0,
    suppressed: status === "suppressed" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
  };
}

async function updateAlertEventStatus({
  organizationId,
  eventId,
  status,
  error,
  asOf,
}: {
  organizationId: string;
  eventId: string;
  status: "sent" | "failed" | "suppressed" | "awaiting_approval";
  error?: string;
  asOf: Date;
}) {
  await db
    .update(alertEvents)
    .set({
      status,
      sentAt: status === "sent" ? asOf : null,
      error,
    })
    .where(and(eq(alertEvents.id, eventId), eq(alertEvents.organizationId, organizationId)));
}

async function createDailyBriefEvent(
  organizationId: string,
  snapshots: SnapshotLike[],
  asOf: Date,
): Promise<EventOutcome> {
  const payload = buildDailyBriefPayload(organizationId, snapshots, asOf);
  if (!payload) return { created: false };
  const severity = highestSeverity(snapshots);

  return insertAlertEvent({
    organizationId,
    ruleId: null,
    itemId: null,
    snapshotId: null,
    severity,
    channel: "in_app",
    status: "sent",
    title: payload.title,
    body: payload.body,
    evidence: payload.evidence,
    freshness: payload.freshness,
    confidence: payload.confidence,
    dedupeKey: stableKey("daily-brief", organizationId, asOf.toISOString().slice(0, 10)),
    requiresApproval: false,
    asOf,
  });
}

async function insertAlertEvent({
  organizationId,
  ruleId,
  itemId,
  snapshotId,
  severity,
  channel,
  status,
  title,
  body,
  evidence,
  freshness,
  confidence,
  dedupeKey,
  requiresApproval,
  error,
  asOf,
}: {
  organizationId: string;
  ruleId: string | null;
  itemId: string | null;
  snapshotId: string | null;
  severity: SnapshotLike["riskLevel"];
  channel: AlertChannel;
  status: "queued" | "sent" | "failed" | "suppressed" | "awaiting_approval";
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  freshness: Record<string, unknown>;
  confidence: number;
  dedupeKey: string;
  requiresApproval: boolean;
  error?: string;
  asOf: Date;
}): Promise<EventOutcome> {
  const [row] = await db
    .insert(alertEvents)
    .values({
      organizationId,
      ruleId,
      itemId,
      snapshotId,
      severity,
      channel,
      status,
      title,
      body,
      evidence,
      freshness,
      confidence,
      dedupeKey,
      requiresApproval,
      scheduledFor: asOf,
      sentAt: status === "sent" ? asOf : null,
      error,
    })
    .onConflictDoNothing({
      target: [alertEvents.organizationId, alertEvents.dedupeKey],
    })
    .returning({ id: alertEvents.id });

  if (!row) return { created: false };
  return {
    created: true,
    eventId: row.id,
    events: 1,
    sent: status === "sent" ? 1 : 0,
    suppressed: status === "suppressed" ? 1 : 0,
    awaitingApproval: status === "awaiting_approval" ? 1 : 0,
    failed: status === "failed" ? 1 : 0,
  };
}

async function createHumanApprovalTask({
  organizationId,
  alertEventId,
  snapshot,
  payload,
}: {
  organizationId: string;
  alertEventId: string;
  snapshot: SnapshotLike;
  payload: AlertPayload;
}) {
  await db.insert(humanReviewTasks).values({
    organizationId,
    type: "critical_alert_approval",
    subjectType: "alert_event",
    subjectId: alertEventId,
    title: `Approve critical alert: ${snapshot.itemName}`,
    description:
      "Critical alert delivery is blocked until a human approves it.",
    payload: {
      alertEventId,
      snapshotId: snapshot.id,
      evidence: payload.evidence,
      freshness: payload.freshness,
      confidence: payload.confidence,
    },
  });
}

async function reserveCooldown({
  organizationId,
  ruleId,
  itemId,
  channel,
  riskLevel,
  cooldownMinutes,
}: {
  organizationId: string;
  ruleId: string;
  itemId: string;
  channel: AlertChannel;
  riskLevel: SnapshotLike["riskLevel"];
  cooldownMinutes: number;
}): Promise<{ suppressed: boolean; configured: boolean }> {
  if (cooldownMinutes <= 0) return { suppressed: false, configured: false };
  const redis = tryGetRedis();
  if (!redis) return { suppressed: false, configured: false };

  const key = [
    "msm",
    "alert-cooldown",
    organizationId,
    ruleId,
    itemId,
    channel,
    riskLevel,
  ].join(":");
  const reserved = await redis.set(key, "1", {
    ex: cooldownMinutes * 60,
    nx: true,
  });
  return { suppressed: reserved !== "OK", configured: true };
}

function highestSeverity(snapshots: SnapshotLike[]) {
  const highest = [...snapshots].sort(
    (a, b) =>
      SEVERITY_RANK[b.riskLevel] - SEVERITY_RANK[a.riskLevel] ||
      b.riskScore - a.riskScore,
  )[0];
  return highest?.riskLevel ?? "info";
}

type EventOutcome = {
  created: boolean;
  eventId?: string;
  events?: number;
  sent?: number;
  suppressed?: number;
  awaitingApproval?: number;
  failed?: number;
};

function applyOutcome(
  totals: Omit<AlertEvaluationSummary, "ok" | "skipped" | "tenants">,
  outcome: EventOutcome,
) {
  totals.events += outcome.events ?? 0;
  totals.sent += outcome.sent ?? 0;
  totals.suppressed += outcome.suppressed ?? 0;
  totals.awaitingApproval += outcome.awaitingApproval ?? 0;
  totals.failed += outcome.failed ?? 0;
}

function emptySummary(): Omit<AlertEvaluationSummary, "ok" | "skipped" | "tenants"> {
  return {
    rules: 0,
    events: 0,
    briefs: 0,
    sent: 0,
    suppressed: 0,
    awaitingApproval: 0,
    failed: 0,
  };
}

function stableKey(...parts: string[]): string {
  return createHash("sha256").update(parts.join(":")).digest("hex");
}
