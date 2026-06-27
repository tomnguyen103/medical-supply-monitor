import type { ConnectorContext, Severity, StalenessStatus } from "./types";

export const DEFAULT_CONNECTOR_LIMIT = 50;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : undefined;
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "string" ? v.trim() : ""))
      .filter(Boolean);
  }
  const one = asString(value);
  return one ? [one] : [];
}

export function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const direct = asString(value);
    if (direct) return direct;
    const first = asStringArray(value)[0];
    if (first) return first;
  }
  return undefined;
}

export function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

export function parseDate(value: unknown): Date | undefined {
  const raw = asString(value);
  if (!raw) return undefined;

  const ymdCompact = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
  if (ymdCompact) {
    const [, year, month, day] = ymdCompact;
    if (year && month && day) return safeDate(`${year}-${month}-${day}T00:00:00Z`);
  }

  const ymdSlash = /^(\d{4})\/(\d{2})\/(\d{2})/u.exec(raw);
  if (ymdSlash) {
    const [, year, month, day] = ymdSlash;
    if (year && month && day) return safeDate(`${year}-${month}-${day}T00:00:00Z`);
  }

  const mdySlash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/u.exec(raw);
  if (mdySlash) {
    const [, month, day, year] = mdySlash;
    if (!month || !day || !year) return undefined;
    return safeDate(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T00:00:00Z`,
    );
  }

  const compactUtc = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/u.exec(raw);
  if (compactUtc) {
    const [, year, month, day, hour, minute, second] = compactUtc;
    if (year && month && day && hour && minute && second) {
      return safeDate(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
    }
  }

  return safeDate(raw);
}

function safeDate(value: string): Date | undefined {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

export function isoDateKey(date: Date | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "unknown-date";
}

export function stalenessFromDate(
  date: Date | undefined,
  now = new Date(),
): StalenessStatus {
  if (!date) return "unknown";
  const ageDays = Math.max(0, now.getTime() - date.getTime()) / 86_400_000;
  if (ageDays <= 7) return "fresh";
  if (ageDays <= 30) return "aging";
  if (ageDays <= 90) return "stale";
  return "expired";
}

export function severityFromScore(score: number): Severity {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "moderate";
  if (score > 0) return "low";
  return "info";
}

export function normalizeIdentifier(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized || undefined;
}

export function stableKey(...parts: Array<string | number | null | undefined>): string {
  return parts
    .map((part) => String(part ?? "unknown").toLowerCase().trim())
    .join(":")
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-");
}

export function extractNdc(value: string | undefined): string | undefined {
  return value?.match(/\b\d{4,5}-\d{3,4}-\d{1,2}\b/u)?.[0];
}

export function extractGtin(value: string | undefined): string | undefined {
  const match = value?.match(/\b(?:gtin[:\s]*)?(\d{14})\b/iu);
  return match?.[1];
}

export function textFromHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

export async function fetchJson<T>(
  url: string,
  ctx: ConnectorContext,
): Promise<T> {
  const res = await fetch(url, {
    signal: ctx.signal,
    headers: {
      Accept: "application/json",
      "User-Agent": ctx.userAgent,
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${safeRequestLabel(url)}`);
  }
  return (await res.json()) as T;
}

export async function fetchText(
  url: string,
  ctx: ConnectorContext,
  accept = "text/plain",
): Promise<string> {
  const res = await fetch(url, {
    signal: ctx.signal,
    headers: {
      Accept: accept,
      "User-Agent": ctx.userAgent,
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed (${res.status}) for ${safeRequestLabel(url)}`);
  }
  return res.text();
}

function safeRequestLabel(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "external feed";
  }
}
