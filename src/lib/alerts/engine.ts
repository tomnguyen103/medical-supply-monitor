import "server-only";

import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  buildAlertPayload,
  buildDailyBriefPayload,
  SEVERITY_RANK,
  alertStatusForDeliveryStatus,
  isAwaitingHumanApproval,
  snapshotMatchesRule,
  type AlertPayload,
  type DeliverableAlertStatus,
  type AlertRuleLike,
  type SnapshotLike,
} from "@/lib/alerts/core";
import { deliverAlert, type DeliveryTarget } from "@/lib/alerts/delivery";
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
  /** Orgs whose evaluation threw an unhandled exception — distinct from
   * `failed`, which counts individual alert-delivery failures (a normal,
   * expected outcome). Callers gating on "did everything fail" should use
   * this, not `failed`. */
  tenantsFailed: number;
}

export type AlertApprovalOutcome =
  | {
      ok: true;
      status: "approved";
      deliveryStatus: DeliverableAlertStatus;
      error?: string;
    }
  | { ok: true; status: "rejected" }
  | { ok: false; reason: "not-found" | "not-awaiting-approval" };

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
      tenantsFailed: 0,
    };
  }

  const asOf = options.asOf ?? new Date();
  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  const totals = emptySummary();
  let tenantsFailed = 0;

  for (const org of orgRows) {
    try {
      const tenant = await evaluateTenantAlerts(org.id, asOf);
      totals.rules += tenant.rules;
      totals.events += tenant.events;
      totals.briefs += tenant.briefs;
      totals.sent += tenant.sent;
      totals.suppressed += tenant.suppressed;
      totals.awaitingApproval += tenant.awaitingApproval;
      totals.failed += tenant.failed;
    } catch (error) {
      Sentry.captureException(error, {
        extra: { organizationId: org.id, phase: "alert-evaluation" },
      });
      tenantsFailed += 1;
    }
  }

  return {
    ok: totals.failed === 0,
    tenants: orgRows.length,
    tenantsFailed,
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
      tenantsFailed: 0,
    };
  }

  const asOf = options.asOf ?? new Date();
  const tenant = await evaluateTenantAlerts(organizationId, asOf);
  return {
    ok: tenant.failed === 0,
    tenants: 1,
    tenantsFailed: 0,
    ...tenant,
  };
}

export async function approveAlertEventForDelivery({
  organizationId,
  eventId,
  actorId,
  asOf = new Date(),
}: {
  organizationId: string;
  eventId: string;
  actorId: string;
  asOf?: Date;
}): Promise<AlertApprovalOutcome> {
  const [event] = await db
    .select({
      id: alertEvents.id,
      channel: alertEvents.channel,
      title: alertEvents.title,
      body: alertEvents.body,
      status: alertEvents.status,
      requiresApproval: alertEvents.requiresApproval,
    })
    .from(alertEvents)
    .where(and(eq(alertEvents.id, eventId), eq(alertEvents.organizationId, organizationId)))
    .limit(1);

  if (!event) return { ok: false, reason: "not-found" };
  if (!isAwaitingHumanApproval(event)) {
    return { ok: false, reason: "not-awaiting-approval" };
  }

  const [approved] = await db
    .update(alertEvents)
    .set({
      status: "approved",
      approvedBy: actorId,
      approvedAt: asOf,
      error: null,
    })
    .where(
      and(
        eq(alertEvents.id, eventId),
        eq(alertEvents.organizationId, organizationId),
        eq(alertEvents.status, "awaiting_approval"),
        eq(alertEvents.requiresApproval, true),
      ),
    )
    .returning({ id: alertEvents.id });

  if (!approved) return { ok: false, reason: "not-awaiting-approval" };

  const taskCompleted = await completeHumanApprovalTask({
    organizationId,
    eventId,
    status: "approved",
    decision: "approved",
    actorId,
    asOf,
  });

  let deliveryStatus: DeliverableAlertStatus = "failed";
  let deliveryError: string | undefined;
  try {
    const target = await loadDeliveryTarget(organizationId);
    const delivery = await deliverAlert({
      channel: event.channel,
      title: event.title,
      body: event.body ?? "",
      target,
    });
    deliveryStatus = alertStatusForDeliveryStatus(delivery.status);
    deliveryError = delivery.error;
  } catch (error) {
    deliveryError =
      error instanceof Error
        ? error.message
        : "Alert delivery failed before receiving a response.";
  }
  await updateAlertEventStatus({
    organizationId,
    eventId,
    status: deliveryStatus,
    error: deliveryError,
    asOf,
  });

  return {
    ok: true,
    status: "approved",
    deliveryStatus,
    error: taskCompleted ? deliveryError : "Approval task was already closed.",
  };
}

export async function rejectAlertEventForDelivery({
  organizationId,
  eventId,
  actorId,
  asOf = new Date(),
}: {
  organizationId: string;
  eventId: string;
  actorId: string;
  asOf?: Date;
}): Promise<AlertApprovalOutcome> {
  const [event] = await db
    .select({
      id: alertEvents.id,
      status: alertEvents.status,
      requiresApproval: alertEvents.requiresApproval,
    })
    .from(alertEvents)
    .where(and(eq(alertEvents.id, eventId), eq(alertEvents.organizationId, organizationId)))
    .limit(1);

  if (!event) return { ok: false, reason: "not-found" };
  if (!isAwaitingHumanApproval(event)) {
    return { ok: false, reason: "not-awaiting-approval" };
  }

  const [rejected] = await db
    .update(alertEvents)
    .set({
      status: "rejected",
      error: "Rejected by human reviewer.",
    })
    .where(
      and(
        eq(alertEvents.id, eventId),
        eq(alertEvents.organizationId, organizationId),
        eq(alertEvents.status, "awaiting_approval"),
        eq(alertEvents.requiresApproval, true),
      ),
    )
    .returning({ id: alertEvents.id });

  if (!rejected) return { ok: false, reason: "not-awaiting-approval" };

  await completeHumanApprovalTask({
    organizationId,
    eventId,
    status: "rejected",
    decision: "rejected",
    actorId,
    asOf,
  });

  return { ok: true, status: "rejected" };
}

async function evaluateTenantAlerts(organizationId: string, asOf: Date) {
  const [rules, snapshots, target] = await Promise.all([
    loadEnabledRules(organizationId),
    loadLatestSnapshots(organizationId),
    loadDeliveryTarget(organizationId),
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
          target,
        });
        applyOutcome(totals, outcome);
      }
    }
  }

  return totals;
}

async function loadDeliveryTarget(organizationId: string): Promise<DeliveryTarget> {
  const [row] = await db
    .select({
      slackWebhookUrl: organizations.slackWebhookUrl,
      alertEmail: organizations.alertEmail,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row ?? { slackWebhookUrl: null, alertEmail: null };
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

export async function loadLatestSnapshots(organizationId: string): Promise<SnapshotLike[]> {
  const latestSnapshot = db
    .select({
      itemId: riskSnapshots.itemId,
      computedAt: sql<Date>`max(${riskSnapshots.computedAt})`.as("max_computed_at"),
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
  target,
}: {
  organizationId: string;
  rule: RuleRow;
  snapshot: SnapshotLike;
  payload: AlertPayload;
  channel: AlertChannel;
  asOf: Date;
  target: DeliveryTarget;
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
  const outcome = await insertOrRetryQueuedAlertEvent({
      organizationId,
      ruleId: rule.id,
      itemId: snapshot.itemId,
      snapshotId: snapshot.id,
      severity: snapshot.riskLevel,
      channel,
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

  const key = cooldownKey({
    organizationId,
    ruleId: rule.id,
    itemId: snapshot.itemId,
    channel,
    riskLevel: snapshot.riskLevel,
  });
  if (rule.cooldownMinutes > 0 && (await isCooldownActive(key))) {
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

  const delivery = await deliverAlert({ channel, title: payload.title, body: payload.body, target });
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

  // Cooldown starts only after a confirmed send — a failed/suppressed
  // attempt must not block the next retry (see insertOrRetryQueuedAlertEvent).
  if (status === "sent") {
    await startCooldown(key, rule.cooldownMinutes);
  }

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

/**
 * Rule-alert path only (daily briefs use insertAlertEvent's plain
 * onConflictDoNothing — they're never retried). A `failed` row for this
 * rule+snapshot+channel is atomically reset to "queued" and retried; a
 * `sent`/`suppressed`/`awaiting_approval` row is left alone. The `setWhere`
 * condition makes this a single atomic upsert — no separate SELECT, no
 * race between concurrent evaluation runs. Pre-existing gap, unchanged by
 * this function: a row stuck in "queued" (process crash between insert and
 * delivery) is not retried either, since the conflict WHERE only matches
 * "failed" — same crash window that existed before this PR.
 */
async function insertOrRetryQueuedAlertEvent({
  organizationId,
  ruleId,
  itemId,
  snapshotId,
  severity,
  channel,
  title,
  body,
  evidence,
  freshness,
  confidence,
  dedupeKey,
  requiresApproval,
  asOf,
}: {
  organizationId: string;
  ruleId: string;
  itemId: string;
  snapshotId: string;
  severity: SnapshotLike["riskLevel"];
  channel: AlertChannel;
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  freshness: Record<string, unknown>;
  confidence: number;
  dedupeKey: string;
  requiresApproval: boolean;
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
      status: "queued",
      title,
      body,
      evidence,
      freshness,
      confidence,
      dedupeKey,
      requiresApproval,
      scheduledFor: asOf,
      sentAt: null,
      error: null,
    })
    .onConflictDoUpdate({
      target: [alertEvents.organizationId, alertEvents.dedupeKey],
      set: { status: "queued", error: null, scheduledFor: asOf },
      setWhere: eq(alertEvents.status, "failed"),
    })
    .returning({ id: alertEvents.id });

  if (!row) return { created: false };
  return { created: true, eventId: row.id, events: 1 };
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

async function completeHumanApprovalTask({
  organizationId,
  eventId,
  status,
  decision,
  actorId,
  asOf,
}: {
  organizationId: string;
  eventId: string;
  status: "approved" | "rejected";
  decision: string;
  actorId: string;
  asOf: Date;
}): Promise<boolean> {
  const completed = await db
    .update(humanReviewTasks)
    .set({
      status,
      decision,
      decidedBy: actorId,
      decidedAt: asOf,
    })
    .where(
      and(
        eq(humanReviewTasks.organizationId, organizationId),
        eq(humanReviewTasks.type, "critical_alert_approval"),
        eq(humanReviewTasks.subjectType, "alert_event"),
        eq(humanReviewTasks.subjectId, eventId),
        eq(humanReviewTasks.status, "open"),
      ),
    )
    .returning({ id: humanReviewTasks.id });

  return completed.length > 0;
}

function cooldownKey({
  organizationId,
  ruleId,
  itemId,
  channel,
  riskLevel,
}: {
  organizationId: string;
  ruleId: string;
  itemId: string;
  channel: AlertChannel;
  riskLevel: SnapshotLike["riskLevel"];
}): string {
  return [
    "msm",
    "alert-cooldown",
    organizationId,
    ruleId,
    itemId,
    channel,
    riskLevel,
  ].join(":");
}

/** Read-only check, called before attempting delivery. Fails open on a
 * Redis hiccup — a cooldown-check failure must never block a real alert. */
async function isCooldownActive(key: string): Promise<boolean> {
  const redis = tryGetRedis();
  if (!redis) return false;
  try {
    const value = await redis.get(key);
    return value !== null;
  } catch (error) {
    Sentry.captureException(error, { extra: { key, phase: "cooldown-check" } });
    return false;
  }
}

/** Called only after a confirmed `sent` delivery — see createRuleAlertEvent.
 * A failed/suppressed attempt must never start the cooldown window. */
async function startCooldown(key: string, cooldownMinutes: number): Promise<void> {
  if (cooldownMinutes <= 0) return;
  const redis = tryGetRedis();
  if (!redis) return;
  try {
    await redis.set(key, "1", { ex: cooldownMinutes * 60 });
  } catch (error) {
    Sentry.captureException(error, { extra: { key, phase: "cooldown-start" } });
  }
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

type TenantTotals = Omit<AlertEvaluationSummary, "ok" | "skipped" | "tenants" | "tenantsFailed">;

function applyOutcome(totals: TenantTotals, outcome: EventOutcome) {
  totals.events += outcome.events ?? 0;
  totals.sent += outcome.sent ?? 0;
  totals.suppressed += outcome.suppressed ?? 0;
  totals.awaitingApproval += outcome.awaitingApproval ?? 0;
  totals.failed += outcome.failed ?? 0;
}

function emptySummary(): TenantTotals {
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
