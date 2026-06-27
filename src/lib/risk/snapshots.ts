import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";

import type {
  RiskDomain,
  Severity,
  StalenessStatus,
} from "@/lib/connectors/types";
import { db, isDatabaseConfigured } from "@/lib/db";
import {
  evidenceArtifacts,
  inventorySnapshots,
  itemSuppliers,
  items,
  organizations,
  riskSignals,
  riskSnapshots,
} from "@/lib/db/schema";
import {
  scoreItemRisk,
  summarizeSnapshotChange,
  type ScoringSignalInput,
} from "./scoring";

export interface RiskScoringRunOptions {
  asOf?: Date;
}

export interface RiskScoringRunSummary {
  ok: boolean;
  skipped?: "database-unconfigured";
  tenants: number;
  items: number;
  snapshots: number;
  changed: number;
  failed: number;
}

interface TenantScoreInput {
  itemId: string;
  itemName: string;
  signals: ScoringSignalInput[];
  daysOnHand: number | null;
  isSoleSource: boolean;
  previousSnapshot:
    | {
        id: string;
        riskScore: number;
        riskLevel: Severity;
        computedAt: Date;
      }
    | null;
}

export async function runRiskScoring(
  options: RiskScoringRunOptions = {},
): Promise<RiskScoringRunSummary> {
  if (!isDatabaseConfigured) {
    return {
      ok: false,
      skipped: "database-unconfigured",
      tenants: 0,
      items: 0,
      snapshots: 0,
      changed: 0,
      failed: 0,
    };
  }

  const asOf = options.asOf ?? new Date();
  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  const tenantResults = await Promise.all(
    orgRows.map((org) => scoreTenant(org.id, asOf)),
  );

  return {
    ok: tenantResults.every((result) => result.failed === 0),
    tenants: orgRows.length,
    items: tenantResults.reduce((sum, result) => sum + result.items, 0),
    snapshots: tenantResults.reduce((sum, result) => sum + result.snapshots, 0),
    changed: tenantResults.reduce((sum, result) => sum + result.changed, 0),
    failed: tenantResults.reduce((sum, result) => sum + result.failed, 0),
  };
}

async function scoreTenant(organizationId: string, asOf: Date) {
  const inputs = await loadTenantScoreInputs(organizationId);
  let snapshots = 0;
  let changed = 0;
  let failed = 0;

  for (const input of inputs) {
    try {
      const result = scoreItemRisk({
        asOf,
        signals: input.signals,
        daysOnHand: input.daysOnHand,
        isSoleSource: input.isSoleSource,
      });
      const changeSummary = summarizeSnapshotChange(
        {
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
        },
        input.previousSnapshot,
      );
      const snapshotId = randomUUID();
      await db.batch([
        db.insert(riskSnapshots).values({
          id: snapshotId,
          organizationId,
          itemId: input.itemId,
          scoringVersion: result.scoringVersion,
          riskScore: result.riskScore,
          riskLevel: result.riskLevel,
          confidence: result.confidence,
          components: result.components,
          inputs: result.inputs,
          stalenessStatus: result.stalenessStatus,
          worstSignalAt: result.worstSignalAt,
          rationale: result.rationale,
          previousSnapshotId: input.previousSnapshot?.id,
          changeSummary,
          computedAt: asOf,
        }),
        db.insert(evidenceArtifacts).values(
          buildSnapshotEvidenceValues({
            organizationId,
            snapshotId,
            itemName: input.itemName,
            computedAt: asOf,
            result,
            changeSummary,
          }),
        ),
      ]);

      snapshots += 1;
      if (changeSummary.changed === true) changed += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    items: inputs.length,
    snapshots,
    changed,
    failed,
  };
}

async function loadTenantScoreInputs(
  organizationId: string,
): Promise<TenantScoreInput[]> {
  const [
    itemRows,
    signalRows,
    inventoryRows,
    itemSupplierRows,
    previousSnapshotRows,
  ] = await Promise.all([
    db
      .select({
        id: items.id,
        name: items.name,
      })
      .from(items)
      .where(eq(items.organizationId, organizationId)),
    db
      .select({
        id: riskSignals.id,
        itemId: riskSignals.itemId,
        supplierId: riskSignals.supplierId,
        domain: riskSignals.domain,
        severityScore: riskSignals.severityScore,
        confidence: riskSignals.confidence,
        stalenessStatus: riskSignals.stalenessStatus,
        observedAt: riskSignals.observedAt,
        sourcePublishedAt: riskSignals.sourcePublishedAt,
        lastFetchedAt: riskSignals.lastFetchedAt,
      })
      .from(riskSignals)
      .where(
        and(
          eq(riskSignals.organizationId, organizationId),
          eq(riskSignals.status, "active"),
        ),
      )
      .orderBy(desc(riskSignals.lastFetchedAt), desc(riskSignals.createdAt)),
    db
      .select({
        itemId: inventorySnapshots.itemId,
        daysOnHand: inventorySnapshots.daysOnHand,
        asOf: inventorySnapshots.asOf,
      })
      .from(inventorySnapshots)
      .where(eq(inventorySnapshots.organizationId, organizationId))
      .orderBy(desc(inventorySnapshots.asOf)),
    db
      .select({
        itemId: itemSuppliers.itemId,
        supplierId: itemSuppliers.supplierId,
        isSoleSource: itemSuppliers.isSoleSource,
      })
      .from(itemSuppliers)
      .where(eq(itemSuppliers.organizationId, organizationId)),
    db
      .select({
        id: riskSnapshots.id,
        itemId: riskSnapshots.itemId,
        riskScore: riskSnapshots.riskScore,
        riskLevel: riskSnapshots.riskLevel,
        computedAt: riskSnapshots.computedAt,
      })
      .from(riskSnapshots)
      .where(eq(riskSnapshots.organizationId, organizationId))
      .orderBy(desc(riskSnapshots.computedAt)),
  ]);

  const latestInventoryByItem = new Map<string, number | null>();
  for (const row of inventoryRows) {
    if (!latestInventoryByItem.has(row.itemId)) {
      latestInventoryByItem.set(row.itemId, row.daysOnHand ?? null);
    }
  }

  const supplierStatsByItem = new Map<
    string,
    { supplierIds: Set<string>; hasExplicitSoleSource: boolean }
  >();
  for (const row of itemSupplierRows) {
    const stats = supplierStatsByItem.get(row.itemId) ?? {
      supplierIds: new Set<string>(),
      hasExplicitSoleSource: false,
    };
    stats.supplierIds.add(row.supplierId);
    stats.hasExplicitSoleSource ||= row.isSoleSource;
    supplierStatsByItem.set(row.itemId, stats);
  }

  const directSignalsByItem = new Map<string, ScoringSignalInput[]>();
  const supplierSignalsBySupplier = new Map<string, ScoringSignalInput[]>();
  for (const row of signalRows) {
    const signal = toScoringSignal(row);
    if (row.itemId) {
      const signals = directSignalsByItem.get(row.itemId) ?? [];
      signals.push(signal);
      directSignalsByItem.set(row.itemId, signals);
    }
    if (row.supplierId) {
      const signals = supplierSignalsBySupplier.get(row.supplierId) ?? [];
      signals.push(signal);
      supplierSignalsBySupplier.set(row.supplierId, signals);
    }
  }

  const previousSnapshotByItem = new Map<
    string,
    TenantScoreInput["previousSnapshot"]
  >();
  for (const row of previousSnapshotRows) {
    if (!previousSnapshotByItem.has(row.itemId)) {
      previousSnapshotByItem.set(row.itemId, {
        id: row.id,
        riskScore: row.riskScore,
        riskLevel: row.riskLevel,
        computedAt: row.computedAt,
      });
    }
  }

  return itemRows.map((item) => {
    const supplierStats = supplierStatsByItem.get(item.id);
    const signalsById = new Map<string, ScoringSignalInput>();
    for (const signal of directSignalsByItem.get(item.id) ?? []) {
      if (signal.id) signalsById.set(signal.id, signal);
    }
    for (const supplierId of supplierStats?.supplierIds ?? []) {
      for (const signal of supplierSignalsBySupplier.get(supplierId) ?? []) {
        if (signal.id) signalsById.set(signal.id, signal);
      }
    }

    return {
      itemId: item.id,
      itemName: item.name,
      signals: Array.from(signalsById.values()),
      daysOnHand: latestInventoryByItem.get(item.id) ?? null,
      isSoleSource: Boolean(
        supplierStats?.hasExplicitSoleSource ||
          (supplierStats && supplierStats.supplierIds.size === 1),
      ),
      previousSnapshot: previousSnapshotByItem.get(item.id) ?? null,
    };
  });
}

function toScoringSignal(row: {
  id: string;
  domain: RiskDomain;
  severityScore: number | null;
  confidence: number | null;
  stalenessStatus: StalenessStatus;
  observedAt: Date | null;
  sourcePublishedAt: Date | null;
  lastFetchedAt: Date | null;
}): ScoringSignalInput {
  return {
    id: row.id,
    domain: row.domain,
    severityScore: row.severityScore,
    confidence: row.confidence,
    stalenessStatus: row.stalenessStatus,
    observedAt: row.observedAt,
    sourcePublishedAt: row.sourcePublishedAt,
    lastFetchedAt: row.lastFetchedAt,
  };
}

function buildSnapshotEvidenceValues({
  organizationId,
  snapshotId,
  itemName,
  computedAt,
  result,
  changeSummary,
}: {
  organizationId: string;
  snapshotId: string;
  itemName: string;
  computedAt: Date;
  result: ReturnType<typeof scoreItemRisk>;
  changeSummary: Record<string, unknown>;
}) {
  const payload = {
    scoringVersion: result.scoringVersion,
    riskScore: result.riskScore,
    riskLevel: result.riskLevel,
    confidence: result.confidence,
    stalenessStatus: result.stalenessStatus,
    components: result.components,
    inputs: result.inputs,
    changeSummary,
  };

  return {
    organizationId,
    snapshotId,
    type: "computed",
    title: `Risk score ${result.scoringVersion} for ${itemName}`,
    sourceName: "risk_scoring",
    capturedAt: computedAt,
    contentHash: hashPayload(payload),
    payload,
  } as const;
}

function hashPayload(payload: Record<string, unknown>): string {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value != null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
