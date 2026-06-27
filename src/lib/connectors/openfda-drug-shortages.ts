import type { Connector, ConnectorContext, NormalizedRiskSignal } from "./types";
import {
  DEFAULT_CONNECTOR_LIMIT,
  asRecord,
  asString,
  asStringArray,
  fetchJson,
  firstString,
  isoDateKey,
  parseDate,
  stableKey,
  stalenessFromDate,
  truncate,
} from "./helpers";

const SHORTAGES_URL =
  "https://api.fda.gov/drug/shortages.json?search=status:%22Current%22&limit=" +
  DEFAULT_CONNECTOR_LIMIT;

/**
 * openFDA drug shortages connector.
 *
 * Public source: https://api.fda.gov/drug/shortages.json
 * No API key required. The connector only normalizes public shortage records;
 * tenant matching and persistence happen downstream.
 */
export const openFdaDrugShortagesConnector: Connector = {
  id: "openfda_drug_shortage",
  name: "openFDA Drug Shortages",
  domain: "shortage",
  description:
    "FDA drug shortage list via openFDA. Matches by NDC or generic name to monitored items.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchOpenFdaDrugShortages(ctx);
  },
};

interface OpenFdaShortageResponse {
  results?: unknown[];
}

export async function fetchOpenFdaDrugShortages(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const payload = await fetchJson<OpenFdaShortageResponse>(SHORTAGES_URL, ctx);
  const now = new Date();
  return (payload.results ?? [])
    .map((row) => normalizeOpenFdaDrugShortage(row, now))
    .filter((signal): signal is NormalizedRiskSignal => signal != null);
}

export function normalizeOpenFdaDrugShortage(
  row: unknown,
  fetchedAt = new Date(),
): NormalizedRiskSignal | null {
  const record = asRecord(row);
  if (!record) return null;

  const openfda = asRecord(record.openfda) ?? {};
  const packageNdc = firstString(record.package_ndc, openfda.package_ndc);
  const productNdc = firstString(openfda.product_ndc);
  const ndc = packageNdc ?? productNdc;
  const genericName = firstString(record.generic_name, openfda.generic_name);
  const brandName = firstString(openfda.brand_name);
  const company = firstString(record.company_name, openfda.manufacturer_name);
  const presentation = asString(record.presentation);
  const updateDate = parseDate(record.update_date);
  const availability = asString(record.availability);
  const status = asString(record.status);
  const reason = asString(record.shortage_reason);
  const related = asString(record.related_info);
  const titleName = genericName ?? brandName ?? presentation ?? "Drug product";
  const severityScore = shortageSeverityScore(status, availability);

  return {
    source: openFdaDrugShortagesConnector.id,
    domain: "shortage",
    entityType: ndc ? "ndc" : "item",
    entityId: ndc ?? titleName,
    title: `${titleName} shortage`,
    summary: truncate(
      [availability, reason, related].filter(Boolean).join(". ") ||
        "FDA drug shortage record.",
    ),
    severity: shortageSeverity(severityScore),
    severityScore,
    confidence: 0.92,
    observedAt: updateDate,
    sourcePublishedAt: updateDate,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(updateDate, fetchedAt),
    evidenceUrl: "https://www.accessdata.fda.gov/scripts/drugshortages/",
    raw: record,
    dedupeKey: stableKey("shortage", ndc ?? titleName, status, isoDateKey(updateDate)),
    matchHints: {
      ndc,
      supplierName: company,
      keywords: [
        titleName,
        genericName,
        brandName,
        presentation,
        ...asStringArray(openfda.substance_name),
      ].filter((value): value is string => Boolean(value)),
    },
  };
}

function shortageSeverityScore(
  status: string | undefined,
  availability: string | undefined,
): number {
  const normalized = `${status ?? ""} ${availability ?? ""}`.toLowerCase();
  if (normalized.includes("unavailable")) return 82;
  if (normalized.includes("current")) return 70;
  if (normalized.includes("limited")) return 62;
  if (normalized.includes("resolved") || normalized.includes("available")) return 24;
  return 50;
}

function shortageSeverity(score: number): NormalizedRiskSignal["severity"] {
  if (score >= 80) return "high";
  if (score >= 55) return "moderate";
  if (score > 0) return "low";
  return "info";
}
