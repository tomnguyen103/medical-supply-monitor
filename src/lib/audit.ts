import { db, isDatabaseConfigured } from "@/lib/db";
import { auditLog, type actorTypeEnum } from "@/lib/db/schema";

type ActorType = (typeof actorTypeEnum.enumValues)[number];

export interface AuditLogInput {
  organizationId: string | null;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "apiKey",
  "authorization",
  "cookie",
  "rawPayload",
  "rawPayloadRef",
  "payload",
  "body",
  "description",
]);

export async function writeAuditLog(input: AuditLogInput): Promise<boolean> {
  if (!isDatabaseConfigured) return false;
  try {
    await db.insert(auditLog).values({
      organizationId: input.organizationId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      summary: input.summary,
      metadata: sanitizeAuditMetadata(input.metadata ?? {}),
    });
    return true;
  } catch {
    return false;
  }
}

export function sanitizeAuditMetadata(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeObject(value, 0);
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  return sanitizeObject(value as Record<string, unknown>, depth + 1);
}

function sanitizeObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, raw]) => [
      key,
      isSensitiveKey(key) ? "[redacted]" : sanitizeValue(raw, depth),
    ]),
  );
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key) || SENSITIVE_KEYS.has(key.toLowerCase());
}

function redactText(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "[redacted-phone]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted-ssn]")
    .replace(
      /\b(?:mrn|medical record(?: number)?|patient id)\s*[:#-]?\s*[a-z0-9-]{4,}\b/gi,
      "[redacted-patient-identifier]",
    );
}
