import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  alertEvents,
  alertRules,
  items,
  riskSnapshots,
} from "@/lib/db/schema";

export interface AlertEventListRow {
  id: string;
  title: string;
  body: string | null;
  severity: "info" | "low" | "moderate" | "high" | "critical";
  channel: "in_app" | "email" | "slack" | "teams";
  status:
    | "pending"
    | "awaiting_approval"
    | "approved"
    | "rejected"
    | "queued"
    | "sent"
    | "failed"
    | "suppressed";
  confidence: number | null;
  evidence: Record<string, unknown>;
  freshness: Record<string, unknown>;
  requiresApproval: boolean;
  sentAt: Date | null;
  scheduledFor: Date | null;
  createdAt: Date;
  itemName: string | null;
  riskScore: number | null;
}

const DEFAULT_EVENT_LIMIT = 100;

export function listAlertRules(organizationId: string) {
  return db
    .select()
    .from(alertRules)
    .where(eq(alertRules.organizationId, organizationId))
    .orderBy(desc(alertRules.createdAt));
}

export async function listAlertEvents(
  organizationId: string,
  limit = DEFAULT_EVENT_LIMIT,
): Promise<AlertEventListRow[]> {
  return db
    .select({
      id: alertEvents.id,
      title: alertEvents.title,
      body: alertEvents.body,
      severity: alertEvents.severity,
      channel: alertEvents.channel,
      status: alertEvents.status,
      confidence: alertEvents.confidence,
      evidence: alertEvents.evidence,
      freshness: alertEvents.freshness,
      requiresApproval: alertEvents.requiresApproval,
      sentAt: alertEvents.sentAt,
      scheduledFor: alertEvents.scheduledFor,
      createdAt: alertEvents.createdAt,
      itemName: items.name,
      riskScore: riskSnapshots.riskScore,
    })
    .from(alertEvents)
    .leftJoin(
      items,
      and(eq(alertEvents.itemId, items.id), eq(items.organizationId, organizationId)),
    )
    .leftJoin(
      riskSnapshots,
      and(
        eq(alertEvents.snapshotId, riskSnapshots.id),
        eq(riskSnapshots.organizationId, organizationId),
      ),
    )
    .where(eq(alertEvents.organizationId, organizationId))
    .orderBy(desc(alertEvents.createdAt))
    .limit(limit);
}
