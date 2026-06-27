import { and, count, eq, lt } from "drizzle-orm";

import { db, isDatabaseConfigured } from "@/lib/db";
import {
  agentRuns,
  alertEvents,
  auditLog,
  evidenceArtifacts,
  organizations,
  riskSignals,
  riskSnapshots,
} from "@/lib/db/schema";

export interface RetentionPolicy {
  riskSignalDays: number;
  riskSnapshotDays: number;
  evidenceDays: number;
  alertEventDays: number;
  agentRunDays: number;
  auditLogDays: number;
}

export interface RetentionCleanupSummary {
  ok: boolean;
  skipped?: "database-unconfigured";
  apply: boolean;
  tenants: number;
  deleted: {
    evidenceArtifacts: number;
    riskSignals: number;
    riskSnapshots: number;
    alertEvents: number;
    agentRuns: number;
    auditLog: number;
  };
}

export const DEFAULT_RETENTION_POLICY: RetentionPolicy = {
  riskSignalDays: 365,
  riskSnapshotDays: 365,
  evidenceDays: 365,
  alertEventDays: 365,
  agentRunDays: 180,
  auditLogDays: 730,
};

export function resolveRetentionPolicy(
  settings: Record<string, unknown> | null | undefined,
): RetentionPolicy {
  const retention =
    settings?.retention && typeof settings.retention === "object"
      ? (settings.retention as Record<string, unknown>)
      : {};
  return {
    riskSignalDays: parseDays(retention.riskSignalDays, DEFAULT_RETENTION_POLICY.riskSignalDays),
    riskSnapshotDays: parseDays(
      retention.riskSnapshotDays,
      DEFAULT_RETENTION_POLICY.riskSnapshotDays,
    ),
    evidenceDays: parseDays(retention.evidenceDays, DEFAULT_RETENTION_POLICY.evidenceDays),
    alertEventDays: parseDays(retention.alertEventDays, DEFAULT_RETENTION_POLICY.alertEventDays),
    agentRunDays: parseDays(retention.agentRunDays, DEFAULT_RETENTION_POLICY.agentRunDays),
    auditLogDays: parseDays(retention.auditLogDays, DEFAULT_RETENTION_POLICY.auditLogDays),
  };
}

export async function runRetentionCleanup({
  asOf = new Date(),
  apply = true,
}: {
  asOf?: Date;
  apply?: boolean;
} = {}): Promise<RetentionCleanupSummary> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      skipped: "database-unconfigured",
      apply,
      tenants: 0,
      deleted: emptyDeleted(),
    };
  }

  const orgRows = await db
    .select({ id: organizations.id, settings: organizations.settings })
    .from(organizations);
  const totals = emptyDeleted();
  for (const org of orgRows) {
    const policy = resolveRetentionPolicy(org.settings);
    const tenant = await runRetentionCleanupForOrganization({
      organizationId: org.id,
      policy,
      asOf,
      apply,
    });
    addDeleted(totals, tenant.deleted);
  }

  return {
    ok: true,
    apply,
    tenants: orgRows.length,
    deleted: totals,
  };
}

export async function runRetentionCleanupForOrganization({
  organizationId,
  policy = DEFAULT_RETENTION_POLICY,
  asOf = new Date(),
  apply = true,
}: {
  organizationId: string;
  policy?: RetentionPolicy;
  asOf?: Date;
  apply?: boolean;
}): Promise<RetentionCleanupSummary> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      skipped: "database-unconfigured",
      apply,
      tenants: 0,
      deleted: emptyDeleted(),
    };
  }

  const deleted = {
    evidenceArtifacts: await cleanupEvidence(organizationId, cutoff(asOf, policy.evidenceDays), apply),
    alertEvents: await cleanupAlertEvents(organizationId, cutoff(asOf, policy.alertEventDays), apply),
    agentRuns: await cleanupAgentRuns(organizationId, cutoff(asOf, policy.agentRunDays), apply),
    auditLog: await cleanupAuditLog(organizationId, cutoff(asOf, policy.auditLogDays), apply),
    riskSnapshots: await cleanupRiskSnapshots(organizationId, cutoff(asOf, policy.riskSnapshotDays), apply),
    riskSignals: await cleanupRiskSignals(organizationId, cutoff(asOf, policy.riskSignalDays), apply),
  };

  return {
    ok: true,
    apply,
    tenants: 1,
    deleted,
  };
}

async function cleanupEvidence(organizationId: string, olderThan: Date, apply: boolean) {
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(evidenceArtifacts)
        .where(
          and(
            eq(evidenceArtifacts.organizationId, organizationId),
            lt(evidenceArtifacts.capturedAt, olderThan),
          ),
        ),
    );
  }
  const deleted = await countRows(
    db
      .select({ value: count() })
      .from(evidenceArtifacts)
      .where(
        and(
          eq(evidenceArtifacts.organizationId, organizationId),
          lt(evidenceArtifacts.capturedAt, olderThan),
        ),
      ),
  );
  await db
    .delete(evidenceArtifacts)
    .where(
      and(
        eq(evidenceArtifacts.organizationId, organizationId),
        lt(evidenceArtifacts.capturedAt, olderThan),
      ),
    );
  return deleted;
}

async function cleanupAlertEvents(organizationId: string, olderThan: Date, apply: boolean) {
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(alertEvents)
        .where(
          and(eq(alertEvents.organizationId, organizationId), lt(alertEvents.createdAt, olderThan)),
        ),
    );
  }
  const deleted = await countRows(
    db
      .select({ value: count() })
      .from(alertEvents)
      .where(
        and(eq(alertEvents.organizationId, organizationId), lt(alertEvents.createdAt, olderThan)),
      ),
  );
  await db
    .delete(alertEvents)
    .where(and(eq(alertEvents.organizationId, organizationId), lt(alertEvents.createdAt, olderThan)));
  return deleted;
}

async function cleanupAgentRuns(organizationId: string, olderThan: Date, apply: boolean) {
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(agentRuns)
        .where(and(eq(agentRuns.organizationId, organizationId), lt(agentRuns.createdAt, olderThan))),
    );
  }
  const deleted = await countRows(
    db
      .select({ value: count() })
      .from(agentRuns)
      .where(and(eq(agentRuns.organizationId, organizationId), lt(agentRuns.createdAt, olderThan))),
  );
  await db
    .delete(agentRuns)
    .where(and(eq(agentRuns.organizationId, organizationId), lt(agentRuns.createdAt, olderThan)));
  return deleted;
}

async function cleanupAuditLog(organizationId: string, olderThan: Date, apply: boolean) {
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(auditLog)
        .where(and(eq(auditLog.organizationId, organizationId), lt(auditLog.createdAt, olderThan))),
    );
  }
  const deleted = await countRows(
    db
      .select({ value: count() })
      .from(auditLog)
      .where(and(eq(auditLog.organizationId, organizationId), lt(auditLog.createdAt, olderThan))),
  );
  await db
    .delete(auditLog)
    .where(and(eq(auditLog.organizationId, organizationId), lt(auditLog.createdAt, olderThan)));
  return deleted;
}

async function cleanupRiskSnapshots(organizationId: string, olderThan: Date, apply: boolean) {
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(riskSnapshots)
        .where(
          and(eq(riskSnapshots.organizationId, organizationId), lt(riskSnapshots.computedAt, olderThan)),
        ),
    );
  }
  const deleted = await countRows(
    db
      .select({ value: count() })
      .from(riskSnapshots)
      .where(
        and(eq(riskSnapshots.organizationId, organizationId), lt(riskSnapshots.computedAt, olderThan)),
      ),
  );
  await db
    .delete(riskSnapshots)
    .where(and(eq(riskSnapshots.organizationId, organizationId), lt(riskSnapshots.computedAt, olderThan)));
  return deleted;
}

async function cleanupRiskSignals(organizationId: string, olderThan: Date, apply: boolean) {
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(riskSignals)
        .where(and(eq(riskSignals.organizationId, organizationId), lt(riskSignals.createdAt, olderThan))),
    );
  }
  const deleted = await countRows(
    db
      .select({ value: count() })
      .from(riskSignals)
      .where(and(eq(riskSignals.organizationId, organizationId), lt(riskSignals.createdAt, olderThan))),
  );
  await db
    .delete(riskSignals)
    .where(and(eq(riskSignals.organizationId, organizationId), lt(riskSignals.createdAt, olderThan)));
  return deleted;
}

async function countRows(query: Promise<Array<{ value: number }>>) {
  const [row] = await query;
  return row?.value ?? 0;
}

function parseDays(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(2_555, Math.max(30, Math.floor(parsed)));
}

function cutoff(asOf: Date, days: number) {
  return new Date(asOf.getTime() - days * 24 * 60 * 60 * 1000);
}

function emptyDeleted(): RetentionCleanupSummary["deleted"] {
  return {
    evidenceArtifacts: 0,
    riskSignals: 0,
    riskSnapshots: 0,
    alertEvents: 0,
    agentRuns: 0,
    auditLog: 0,
  };
}

function addDeleted(
  totals: RetentionCleanupSummary["deleted"],
  next: RetentionCleanupSummary["deleted"],
) {
  totals.evidenceArtifacts += next.evidenceArtifacts;
  totals.riskSignals += next.riskSignals;
  totals.riskSnapshots += next.riskSnapshots;
  totals.alertEvents += next.alertEvents;
  totals.agentRuns += next.agentRuns;
  totals.auditLog += next.auditLog;
}
