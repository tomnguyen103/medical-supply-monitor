import type { Connector, ConnectorContext, NormalizedRiskSignal } from "./types";
import {
  DEFAULT_CONNECTOR_LIMIT,
  asRecord,
  asString,
  extractGtin,
  extractNdc,
  fetchJson,
  firstString,
  isoDateKey,
  parseDate,
  stableKey,
  stalenessFromDate,
  truncate,
} from "./helpers";

const RECALL_LIMIT = Math.max(1, Math.floor(DEFAULT_CONNECTOR_LIMIT / 2));
const DRUG_RECALLS_URL =
  "https://api.fda.gov/drug/enforcement.json?sort=report_date:desc&limit=" +
  RECALL_LIMIT;
const DEVICE_RECALLS_URL =
  "https://api.fda.gov/device/enforcement.json?sort=report_date:desc&limit=" +
  RECALL_LIMIT;

/**
 * openFDA drug/device recalls connector.
 *
 * Public sources:
 * - https://api.fda.gov/drug/enforcement.json
 * - https://api.fda.gov/device/enforcement.json
 */
export const openFdaRecallsConnector: Connector = {
  id: "openfda_recall",
  name: "openFDA Recalls (Drug + Device)",
  domain: "recall",
  description:
    "FDA enforcement and recall reports via openFDA. Matches by NDC, GTIN, firm name, or product text.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchOpenFdaRecalls(ctx);
  },
};

interface OpenFdaEnforcementResponse {
  results?: unknown[];
}

export async function fetchOpenFdaRecalls(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const [drug, device] = await Promise.all([
    fetchJson<OpenFdaEnforcementResponse>(DRUG_RECALLS_URL, ctx),
    fetchJson<OpenFdaEnforcementResponse>(DEVICE_RECALLS_URL, ctx),
  ]);
  const now = new Date();
  return [
    ...(drug.results ?? []).map((row) => normalizeOpenFdaRecall(row, "drug", now)),
    ...(device.results ?? []).map((row) => normalizeOpenFdaRecall(row, "device", now)),
  ].filter((signal): signal is NormalizedRiskSignal => signal != null);
}

export function normalizeOpenFdaRecall(
  row: unknown,
  kind: "drug" | "device",
  fetchedAt = new Date(),
): NormalizedRiskSignal | null {
  const record = asRecord(row);
  if (!record) return null;

  const description = asString(record.product_description);
  const codeInfo = [asString(record.code_info), asString(record.more_code_info)]
    .filter(Boolean)
    .join(" ");
  const ndc = extractNdc(`${description ?? ""} ${codeInfo}`);
  const gtin = extractGtin(`${description ?? ""} ${codeInfo}`);
  const recallNumber = asString(record.recall_number);
  const eventId = asString(record.event_id);
  const reportDate = parseDate(record.report_date);
  const classification = asString(record.classification);
  const firm = asString(record.recalling_firm);
  const reason = asString(record.reason_for_recall);
  const status = asString(record.status);
  const titleSubject = firstString(description, record.product_type) ?? "FDA product";
  const severityScore = recallSeverityScore(classification, status);

  return {
    source: openFdaRecallsConnector.id,
    domain: "recall",
    entityType: gtin ? "gtin" : ndc ? "ndc" : "manufacturer",
    entityId: gtin ?? ndc ?? firm ?? recallNumber ?? eventId ?? null,
    title: `${classification ?? "FDA"} recall: ${truncate(titleSubject, 120)}`,
    summary: truncate(
      [status, firm, reason].filter(Boolean).join(". ") || "FDA enforcement report.",
    ),
    severity: recallSeverity(severityScore),
    severityScore,
    confidence: 0.9,
    observedAt: reportDate,
    sourcePublishedAt: reportDate,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(reportDate, fetchedAt),
    evidenceUrl:
      "https://api.fda.gov/" +
      `${kind}/enforcement.json?search=recall_number:%22${encodeURIComponent(
        recallNumber ?? "",
      )}%22`,
    raw: { ...record, enforcement_kind: kind },
    dedupeKey: stableKey(kind, recallNumber ?? eventId, isoDateKey(reportDate)),
    matchHints: {
      ndc,
      gtin,
      supplierName: firm,
      countryCode: asString(record.country),
      keywords: [description, reason, codeInfo].filter((value): value is string =>
        Boolean(value),
      ),
    },
  };
}

function recallSeverityScore(
  classification: string | undefined,
  status: string | undefined,
): number {
  const classText = classification?.toLowerCase() ?? "";
  const statusText = status?.toLowerCase() ?? "";
  let score = 55;
  if (classText.includes("class i")) score = 95;
  else if (classText.includes("class ii")) score = 76;
  else if (classText.includes("class iii")) score = 45;
  if (statusText.includes("terminated") || statusText.includes("completed")) {
    score = Math.max(18, score - 35);
  }
  return score;
}

function recallSeverity(score: number): NormalizedRiskSignal["severity"] {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "moderate";
  if (score > 0) return "low";
  return "info";
}
