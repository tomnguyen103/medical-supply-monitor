import "server-only";

import { createHash } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  evidenceArtifacts,
  riskSignals,
  type NewRiskSignal,
} from "@/lib/db/schema";
import type { NormalizedRiskSignal } from "@/lib/connectors/types";
import type { SignalMatch } from "./matching";

export interface PersistedSignal {
  signalId: string;
  evidenceId?: string;
}

export async function upsertMatchedSignal(
  signal: NormalizedRiskSignal,
  match: SignalMatch,
): Promise<PersistedSignal> {
  const values = toRiskSignalValues(signal, match);
  const [row] = await db
    .insert(riskSignals)
    .values(values)
    .onConflictDoUpdate({
      target: [
        riskSignals.organizationId,
        riskSignals.source,
        riskSignals.dedupeKey,
      ],
      set: {
        domain: values.domain,
        entityType: values.entityType,
        entityId: values.entityId,
        itemId: values.itemId,
        supplierId: values.supplierId,
        title: values.title,
        summary: values.summary,
        severity: values.severity,
        severityScore: values.severityScore,
        confidence: values.confidence,
        status: values.status,
        observedAt: values.observedAt,
        sourcePublishedAt: values.sourcePublishedAt,
        lastFetchedAt: values.lastFetchedAt,
        stalenessStatus: values.stalenessStatus,
        evidenceUrl: values.evidenceUrl,
        metadata: values.metadata,
      },
    })
    .returning({ id: riskSignals.id });

  if (!row) {
    throw new Error("Risk signal upsert did not return an id.");
  }

  const evidenceId = await persistEvidence(signal, match.organizationId, row.id);
  if (evidenceId) {
    await db
      .update(riskSignals)
      .set({ rawPayloadRef: evidenceId })
      .where(
        and(
          eq(riskSignals.id, row.id),
          eq(riskSignals.organizationId, match.organizationId),
        ),
      );
  }

  return { signalId: row.id, evidenceId };
}

/**
 * Marks an org's "active" signals for this source resolved when they're no
 * longer present in the latest fetch (their dedupeKey wasn't matched+
 * persisted this run). Relies on dedupeKey being a STABLE identity, not a
 * volatile field — a signal that's still genuinely active always keeps the
 * same key across runs, so anything absent really is gone (resolved),
 * not just relabeled. Call only after a successful fetch for this
 * (organizationId, source) — an empty `seenDedupeKeys` from a genuinely
 * failed/aborted fetch would otherwise wrongly resolve everything.
 */
export async function reconcileResolvedSignals(
  organizationId: string,
  source: string,
  seenDedupeKeys: string[],
): Promise<number> {
  const rows = await db
    .update(riskSignals)
    .set({ status: "resolved" })
    .where(
      and(
        eq(riskSignals.organizationId, organizationId),
        eq(riskSignals.source, source),
        eq(riskSignals.status, "active"),
        seenDedupeKeys.length > 0
          ? notInArray(riskSignals.dedupeKey, seenDedupeKeys)
          : undefined,
      ),
    )
    .returning({ id: riskSignals.id });
  return rows.length;
}

function toRiskSignalValues(
  signal: NormalizedRiskSignal,
  match: SignalMatch,
): NewRiskSignal {
  return {
    organizationId: match.organizationId,
    source: signal.source,
    domain: signal.domain,
    entityType: signal.entityType,
    entityId: signal.entityId,
    itemId: match.itemId,
    supplierId: match.supplierId,
    title: signal.title,
    summary: signal.summary,
    severity: signal.severity,
    severityScore: signal.severityScore,
    confidence: signal.confidence,
    status: "active",
    observedAt: signal.observedAt,
    sourcePublishedAt: signal.sourcePublishedAt,
    lastFetchedAt: signal.lastFetchedAt,
    stalenessStatus: signal.stalenessStatus,
    evidenceUrl: signal.evidenceUrl,
    dedupeKey: signal.dedupeKey,
    metadata: {
      match: {
        reason: match.reason,
        matchedValue: match.matchedValue,
      },
      matchHints: signal.matchHints ?? {},
    },
  };
}

async function persistEvidence(
  signal: NormalizedRiskSignal,
  organizationId: string,
  signalId: string,
): Promise<string | undefined> {
  const payload = signal.raw ?? {
    title: signal.title,
    summary: signal.summary,
    evidenceUrl: signal.evidenceUrl,
  };
  const contentHash = hashPayload(payload);
  const [existing] = await db
    .select({ id: evidenceArtifacts.id })
    .from(evidenceArtifacts)
    .where(
      and(
        eq(evidenceArtifacts.organizationId, organizationId),
        eq(evidenceArtifacts.signalId, signalId),
        eq(evidenceArtifacts.contentHash, contentHash),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [row] = await db
    .insert(evidenceArtifacts)
    .values({
      organizationId,
      signalId,
      type: signal.raw ? "api_response" : "external_link",
      title: signal.title,
      url: signal.evidenceUrl,
      sourceName: signal.source,
      capturedAt: signal.lastFetchedAt,
      contentHash,
      payload,
    })
    .returning({ id: evidenceArtifacts.id });
  return row?.id;
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
