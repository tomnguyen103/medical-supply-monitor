import { and, count, eq, isNull, lt, sql, type SQL } from "drizzle-orm";

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
  const evidenceDays = parseDays(retention.evidenceDays, DEFAULT_RETENTION_POLICY.evidenceDays);
  const riskSignalDays = parseDays(
    retention.riskSignalDays,
    DEFAULT_RETENTION_POLICY.riskSignalDays,
  );
  const riskSnapshotDays = parseDays(
    retention.riskSnapshotDays,
    DEFAULT_RETENTION_POLICY.riskSnapshotDays,
  );
  return enforceEvidenceParentRetention({
    riskSignalDays: Math.max(riskSignalDays, evidenceDays),
    riskSnapshotDays: Math.max(riskSnapshotDays, evidenceDays),
    evidenceDays,
    alertEventDays: parseDays(retention.alertEventDays, DEFAULT_RETENTION_POLICY.alertEventDays),
    agentRunDays: parseDays(retention.agentRunDays, DEFAULT_RETENTION_POLICY.agentRunDays),
    auditLogDays: parseDays(retention.auditLogDays, DEFAULT_RETENTION_POLICY.auditLogDays),
  });
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
  const systemRows = await runSystemRetentionCleanup({
    policy: DEFAULT_RETENTION_POLICY,
    asOf,
    apply,
  });
  addDeleted(totals, systemRows.deleted);

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

  const effectivePolicy = enforceEvidenceParentRetention(policy);
  const evidenceCutoff = cutoff(asOf, effectivePolicy.evidenceDays);
  const deleted = {
    evidenceArtifacts: await cleanupEvidence(organizationId, evidenceCutoff, apply),
    alertEvents: await cleanupAlertEvents(organizationId, cutoff(asOf, effectivePolicy.alertEventDays), apply),
    agentRuns: await cleanupAgentRuns(organizationId, cutoff(asOf, effectivePolicy.agentRunDays), apply),
    auditLog: await cleanupAuditLog(organizationId, cutoff(asOf, effectivePolicy.auditLogDays), apply),
    riskSnapshots: await cleanupRiskSnapshots(
      organizationId,
      cutoff(asOf, effectivePolicy.riskSnapshotDays),
      evidenceCutoff,
      apply,
    ),
    riskSignals: await cleanupRiskSignals(
      organizationId,
      cutoff(asOf, effectivePolicy.riskSignalDays),
      evidenceCutoff,
      apply,
    ),
  };

  return {
    ok: true,
    apply,
    tenants: 1,
    deleted,
  };
}

async function runSystemRetentionCleanup({
  policy,
  asOf,
  apply,
}: {
  policy: RetentionPolicy;
  asOf: Date;
  apply: boolean;
}): Promise<RetentionCleanupSummary> {
  const deleted = emptyDeleted();
  deleted.agentRuns = await cleanupAgentRuns(null, cutoff(asOf, policy.agentRunDays), apply);
  deleted.auditLog = await cleanupAuditLog(null, cutoff(asOf, policy.auditLogDays), apply);
  return {
    ok: true,
    apply,
    tenants: 0,
    deleted,
  };
}

async function cleanupEvidence(organizationId: string, olderThan: Date, apply: boolean) {
  const where = and(
    eq(evidenceArtifacts.organizationId, organizationId),
    lt(evidenceArtifacts.capturedAt, olderThan),
  );
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(evidenceArtifacts)
        .where(where),
    );
  }
  return deleteAndCount(
    sql`delete from ${evidenceArtifacts} where ${where} returning 1`,
  );
}

async function cleanupAlertEvents(organizationId: string, olderThan: Date, apply: boolean) {
  const where = and(eq(alertEvents.organizationId, organizationId), lt(alertEvents.createdAt, olderThan));
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(alertEvents)
        .where(where),
    );
  }
  return deleteAndCount(sql`delete from ${alertEvents} where ${where} returning 1`);
}

async function cleanupAgentRuns(organizationId: string | null, olderThan: Date, apply: boolean) {
  const where = and(
    organizationId === null ? isNull(agentRuns.organizationId) : eq(agentRuns.organizationId, organizationId),
    lt(agentRuns.createdAt, olderThan),
  );
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(agentRuns)
        .where(where),
    );
  }
  return deleteAndCount(sql`delete from ${agentRuns} where ${where} returning 1`);
}

async function cleanupAuditLog(organizationId: string | null, olderThan: Date, apply: boolean) {
  const where = and(
    organizationId === null ? isNull(auditLog.organizationId) : eq(auditLog.organizationId, organizationId),
    lt(auditLog.createdAt, olderThan),
  );
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(auditLog)
        .where(where),
    );
  }
  return deleteAndCount(sql`delete from ${auditLog} where ${where} returning 1`);
}

async function cleanupRiskSnapshots(
  organizationId: string,
  olderThan: Date,
  evidenceOlderThan: Date,
  apply: boolean,
) {
  const where = and(
    eq(riskSnapshots.organizationId, organizationId),
    lt(riskSnapshots.computedAt, olderThan),
    sql`not exists (
      select 1
      from ${evidenceArtifacts}
      where ${evidenceArtifacts.organizationId} = ${organizationId}
        and ${evidenceArtifacts.snapshotId} = ${riskSnapshots.id}
        and ${evidenceArtifacts.capturedAt} >= ${evidenceOlderThan}
    )`,
  );
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(riskSnapshots)
        .where(where),
    );
  }
  return deleteAndCount(sql`delete from ${riskSnapshots} where ${where} returning 1`);
}

async function cleanupRiskSignals(
  organizationId: string,
  olderThan: Date,
  evidenceOlderThan: Date,
  apply: boolean,
) {
  const where = and(
    eq(riskSignals.organizationId, organizationId),
    lt(riskSignals.createdAt, olderThan),
    sql`not exists (
      select 1
      from ${evidenceArtifacts}
      where ${evidenceArtifacts.organizationId} = ${organizationId}
        and ${evidenceArtifacts.signalId} = ${riskSignals.id}
        and ${evidenceArtifacts.capturedAt} >= ${evidenceOlderThan}
    )`,
  );
  if (!apply) {
    return countRows(
      db
        .select({ value: count() })
        .from(riskSignals)
        .where(where),
    );
  }
  return deleteAndCount(sql`delete from ${riskSignals} where ${where} returning 1`);
}

async function countRows(query: Promise<Array<{ value: number }>>) {
  const [row] = await query;
  return row?.value ?? 0;
}

async function deleteAndCount(deleteSql: SQL) {
  const result = await db.execute<{ value: number | string }>(sql`
    with deleted as (${deleteSql})
    select count(*)::int as value from deleted
  `);
  const rows = "rows" in result ? result.rows : result;
  const value = rows[0]?.value ?? 0;
  return typeof value === "number" ? value : Number(value);
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

function enforceEvidenceParentRetention(policy: RetentionPolicy): RetentionPolicy {
  return {
    ...policy,
    riskSignalDays: Math.max(policy.riskSignalDays, policy.evidenceDays),
    riskSnapshotDays: Math.max(policy.riskSnapshotDays, policy.evidenceDays),
  };
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
