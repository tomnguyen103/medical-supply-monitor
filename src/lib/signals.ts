import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  evidenceArtifacts,
  items,
  riskSignals,
  riskSnapshots,
  suppliers,
  type RiskScoreComponent,
} from "@/lib/db/schema";

export interface SignalEvidenceRow {
  id: string;
  type: string;
  title: string | null;
  url: string | null;
  sourceName: string | null;
  capturedAt: Date;
  contentHash: string | null;
  signalId: string | null;
  snapshotId: string | null;
}

export interface SignalSnapshotRow {
  id: string;
  scoringVersion: string;
  riskScore: number;
  riskLevel: "info" | "low" | "moderate" | "high" | "critical";
  confidence: number | null;
  components: RiskScoreComponent[];
  rationale: string | null;
  stalenessStatus: "fresh" | "aging" | "stale" | "expired" | "unknown";
  computedAt: Date;
  previousSnapshotId: string | null;
  changeSummary: Record<string, unknown> | null;
}

export interface SignalListRow {
  id: string;
  source: string;
  domain: string;
  title: string;
  summary: string | null;
  severity: "info" | "low" | "moderate" | "high" | "critical";
  severityScore: number | null;
  confidence: number | null;
  stalenessStatus: "fresh" | "aging" | "stale" | "expired" | "unknown";
  observedAt: Date | null;
  sourcePublishedAt: Date | null;
  lastFetchedAt: Date | null;
  evidenceUrl: string | null;
  rawPayloadRef: string | null;
  itemId: string | null;
  itemName: string | null;
  supplierName: string | null;
  snapshot: SignalSnapshotRow | null;
  evidence: SignalEvidenceRow[];
}

export async function listRiskSignals(
  organizationId: string,
): Promise<SignalListRow[]> {
  const rows = await db
    .select({
      id: riskSignals.id,
      source: riskSignals.source,
      domain: riskSignals.domain,
      title: riskSignals.title,
      summary: riskSignals.summary,
      severity: riskSignals.severity,
      severityScore: riskSignals.severityScore,
      confidence: riskSignals.confidence,
      stalenessStatus: riskSignals.stalenessStatus,
      observedAt: riskSignals.observedAt,
      sourcePublishedAt: riskSignals.sourcePublishedAt,
      lastFetchedAt: riskSignals.lastFetchedAt,
      evidenceUrl: riskSignals.evidenceUrl,
      rawPayloadRef: riskSignals.rawPayloadRef,
      itemId: riskSignals.itemId,
      itemName: items.name,
      supplierName: suppliers.name,
    })
    .from(riskSignals)
    .leftJoin(
      items,
      and(eq(riskSignals.itemId, items.id), eq(items.organizationId, organizationId)),
    )
    .leftJoin(
      suppliers,
      and(
        eq(riskSignals.supplierId, suppliers.id),
        eq(suppliers.organizationId, organizationId),
      ),
    )
    .where(eq(riskSignals.organizationId, organizationId))
    .orderBy(sql`${riskSignals.lastFetchedAt} desc nulls last`, desc(riskSignals.createdAt));

  if (rows.length === 0) return [];

  const signalIds = rows.map((row) => row.id);
  const itemIds = Array.from(
    new Set(rows.map((row) => row.itemId).filter((id): id is string => Boolean(id))),
  );
  const snapshotsByItem = await loadLatestSnapshotsByItem(organizationId, itemIds);
  const snapshotIds = Array.from(snapshotsByItem.values()).map((snapshot) => snapshot.id);
  const [evidenceBySignal, evidenceBySnapshot] = await Promise.all([
    loadEvidenceBySignal(organizationId, signalIds),
    loadEvidenceBySnapshot(organizationId, snapshotIds),
  ]);

  return rows.map((row) => {
    const snapshot = row.itemId ? snapshotsByItem.get(row.itemId) ?? null : null;
    const signalEvidence = evidenceBySignal.get(row.id) ?? [];
    const snapshotEvidence = snapshot
      ? evidenceBySnapshot.get(snapshot.id) ?? []
      : [];
    return {
      ...row,
      snapshot,
      evidence: [...signalEvidence, ...snapshotEvidence],
    };
  });
}

async function loadLatestSnapshotsByItem(
  organizationId: string,
  itemIds: string[],
): Promise<Map<string, SignalSnapshotRow>> {
  const snapshotsByItem = new Map<string, SignalSnapshotRow>();
  if (itemIds.length === 0) return snapshotsByItem;

  const rows = await db
    .select({
      itemId: riskSnapshots.itemId,
      id: riskSnapshots.id,
      scoringVersion: riskSnapshots.scoringVersion,
      riskScore: riskSnapshots.riskScore,
      riskLevel: riskSnapshots.riskLevel,
      confidence: riskSnapshots.confidence,
      components: riskSnapshots.components,
      rationale: riskSnapshots.rationale,
      stalenessStatus: riskSnapshots.stalenessStatus,
      computedAt: riskSnapshots.computedAt,
      previousSnapshotId: riskSnapshots.previousSnapshotId,
      changeSummary: riskSnapshots.changeSummary,
    })
    .from(riskSnapshots)
    .where(
      and(
        eq(riskSnapshots.organizationId, organizationId),
        inArray(riskSnapshots.itemId, itemIds),
      ),
    )
    .orderBy(desc(riskSnapshots.computedAt));

  for (const row of rows) {
    if (snapshotsByItem.has(row.itemId)) continue;
    snapshotsByItem.set(row.itemId, {
      id: row.id,
      scoringVersion: row.scoringVersion,
      riskScore: row.riskScore,
      riskLevel: row.riskLevel,
      confidence: row.confidence,
      components: row.components,
      rationale: row.rationale,
      stalenessStatus: row.stalenessStatus,
      computedAt: row.computedAt,
      previousSnapshotId: row.previousSnapshotId,
      changeSummary: row.changeSummary,
    });
  }

  return snapshotsByItem;
}

async function loadEvidenceBySignal(
  organizationId: string,
  signalIds: string[],
): Promise<Map<string, SignalEvidenceRow[]>> {
  const evidenceBySignal = new Map<string, SignalEvidenceRow[]>();
  if (signalIds.length === 0) return evidenceBySignal;

  const rows = await db
    .select({
      id: evidenceArtifacts.id,
      type: evidenceArtifacts.type,
      title: evidenceArtifacts.title,
      url: evidenceArtifacts.url,
      sourceName: evidenceArtifacts.sourceName,
      capturedAt: evidenceArtifacts.capturedAt,
      contentHash: evidenceArtifacts.contentHash,
      signalId: evidenceArtifacts.signalId,
      snapshotId: evidenceArtifacts.snapshotId,
    })
    .from(evidenceArtifacts)
    .where(
      and(
        eq(evidenceArtifacts.organizationId, organizationId),
        inArray(evidenceArtifacts.signalId, signalIds),
      ),
    )
    .orderBy(desc(evidenceArtifacts.capturedAt));

  for (const row of rows) {
    if (!row.signalId) continue;
    const evidence = evidenceBySignal.get(row.signalId) ?? [];
    evidence.push(row);
    evidenceBySignal.set(row.signalId, evidence);
  }

  return evidenceBySignal;
}

async function loadEvidenceBySnapshot(
  organizationId: string,
  snapshotIds: string[],
): Promise<Map<string, SignalEvidenceRow[]>> {
  const evidenceBySnapshot = new Map<string, SignalEvidenceRow[]>();
  if (snapshotIds.length === 0) return evidenceBySnapshot;

  const rows = await db
    .select({
      id: evidenceArtifacts.id,
      type: evidenceArtifacts.type,
      title: evidenceArtifacts.title,
      url: evidenceArtifacts.url,
      sourceName: evidenceArtifacts.sourceName,
      capturedAt: evidenceArtifacts.capturedAt,
      contentHash: evidenceArtifacts.contentHash,
      signalId: evidenceArtifacts.signalId,
      snapshotId: evidenceArtifacts.snapshotId,
    })
    .from(evidenceArtifacts)
    .where(
      and(
        eq(evidenceArtifacts.organizationId, organizationId),
        inArray(evidenceArtifacts.snapshotId, snapshotIds),
      ),
    )
    .orderBy(desc(evidenceArtifacts.capturedAt));

  for (const row of rows) {
    if (!row.snapshotId) continue;
    const evidence = evidenceBySnapshot.get(row.snapshotId) ?? [];
    evidence.push(row);
    evidenceBySnapshot.set(row.snapshotId, evidence);
  }

  return evidenceBySnapshot;
}
