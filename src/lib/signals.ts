import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { items, riskSignals, suppliers } from "@/lib/db/schema";

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
  itemName: string | null;
  supplierName: string | null;
}

export async function listRiskSignals(
  organizationId: string,
): Promise<SignalListRow[]> {
  return db
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
      itemName: items.name,
      supplierName: suppliers.name,
    })
    .from(riskSignals)
    .leftJoin(items, eq(riskSignals.itemId, items.id))
    .leftJoin(suppliers, eq(riskSignals.supplierId, suppliers.id))
    .where(eq(riskSignals.organizationId, organizationId))
    .orderBy(desc(riskSignals.lastFetchedAt), desc(riskSignals.createdAt));
}
