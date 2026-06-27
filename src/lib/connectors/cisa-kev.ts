import type { Connector, ConnectorContext, NormalizedRiskSignal } from "./types";
import {
  DEFAULT_CONNECTOR_LIMIT,
  asRecord,
  asString,
  fetchJson,
  parseDate,
  stableKey,
  stalenessFromDate,
  truncate,
} from "./helpers";

const CISA_KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

export const cisaKevConnector: Connector = {
  id: "cisa_kev",
  name: "CISA Known Exploited Vulnerabilities",
  domain: "cyber",
  description:
    "CISA KEV catalog. Matches cyber exposure to supplier names and product keywords.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchCisaKev(ctx);
  },
};

interface CisaKevResponse {
  vulnerabilities?: unknown[];
}

export async function fetchCisaKev(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const payload = await fetchJson<CisaKevResponse>(CISA_KEV_URL, ctx);
  const now = new Date();
  return (payload.vulnerabilities ?? [])
    .slice(0, DEFAULT_CONNECTOR_LIMIT)
    .map((row) => normalizeCisaKev(row, now))
    .filter((signal): signal is NormalizedRiskSignal => signal != null);
}

export function normalizeCisaKev(
  row: unknown,
  fetchedAt = new Date(),
): NormalizedRiskSignal | null {
  const record = asRecord(row);
  if (!record) return null;
  const cve = asString(record.cveID);
  const vendor = asString(record.vendorProject);
  const product = asString(record.product);
  const dateAdded = parseDate(record.dateAdded);
  const ransomware = asString(record.knownRansomwareCampaignUse);
  const vulnerability = asString(record.vulnerabilityName);
  const mitigation = asString(record.requiredAction);
  const severityScore = ransomware?.toLowerCase() === "known" ? 82 : 68;
  const supplierId = vendor
    ? stableKey(vendor, product)
    : product
      ? stableKey(product)
      : null;

  return {
    source: cisaKevConnector.id,
    domain: "cyber",
    entityType: "supplier",
    entityId: supplierId,
    title: `${vendor ?? "Supplier"} ${product ?? "product"} exploited vulnerability`,
    summary: truncate([cve, vulnerability, mitigation].filter(Boolean).join(". ")),
    severity: severityScore >= 80 ? "high" : "moderate",
    severityScore,
    confidence: 0.86,
    observedAt: dateAdded,
    sourcePublishedAt: dateAdded,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(dateAdded, fetchedAt),
    evidenceUrl: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
    raw: record,
    dedupeKey: stableKey(cve, dateAdded?.toISOString().slice(0, 10)),
    matchHints: {
      supplierName: vendor,
      keywords: [vendor, product, cve, vulnerability].filter(
        (value): value is string => Boolean(value),
      ),
    },
  };
}
