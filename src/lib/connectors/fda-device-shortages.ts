import type { Connector, ConnectorContext, NormalizedRiskSignal } from "./types";
import {
  DEFAULT_CONNECTOR_LIMIT,
  fetchText,
  parseDate,
  stableKey,
  stalenessFromDate,
  textFromHtml,
  truncate,
} from "./helpers";

const DEVICE_SHORTAGES_URL =
  "https://www.fda.gov/medical-devices/medical-device-supply-chain-and-shortages/medical-device-shortages";

export const fdaDeviceShortagesConnector: Connector = {
  id: "fda_device_shortage",
  name: "FDA Device Shortages",
  domain: "shortage",
  description:
    "FDA medical device shortage page. Matches by device names, product codes, and supplier keywords.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchFdaDeviceShortages(ctx);
  },
};

export interface FdaDeviceShortageRow {
  device: string;
  productCodes: string[];
  reason?: string;
  status?: string;
  updatedAt?: Date;
}

export async function fetchFdaDeviceShortages(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const html = await fetchText(DEVICE_SHORTAGES_URL, ctx, "text/html");
  const now = new Date();
  return extractFdaDeviceShortageRows(html)
    .slice(0, DEFAULT_CONNECTOR_LIMIT)
    .map((row) => normalizeFdaDeviceShortage(row, now));
}

export function extractFdaDeviceShortageRows(html: string): FdaDeviceShortageRow[] {
  const rows = html.match(/<tr[\s\S]*?<\/tr>/giu) ?? [];
  return rows
    .map((row) => {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu)].map(
        (match) => textFromHtml(match[1] ?? ""),
      );
      if (cells.length < 2) return null;
      const combined = cells.join(" ");
      if (!/shortage|discontinuance|availability|product code/iu.test(combined)) {
        return null;
      }
      const device = cells.find(
        (cell) => cell.length > 4 && !/^(product code|reason|status)$/iu.test(cell),
      );
      if (!device || /^device$/iu.test(device)) return null;
      const productCodes = [
        ...combined.matchAll(/\b[A-Z]{3}\b/gu),
      ].map((match) => match[0]);
      const updatedAt = parseDate(
        cells.find((cell) => /\b\d{1,2}\/\d{1,2}\/\d{4}\b/u.test(cell)) ??
          cells.find((cell) => /\b\d{4}\/\d{2}\/\d{2}\b/u.test(cell)),
      );
      const parsed: FdaDeviceShortageRow = {
        device,
        productCodes: [...new Set(productCodes)],
      };
      const reason = cells.find((cell) =>
        /shortage|limited|discontinued|demand|capacity/iu.test(cell),
      );
      const status = cells.find((cell) =>
        /shortage|available|discontinued|current/iu.test(cell),
      );
      if (reason) parsed.reason = reason;
      if (status) parsed.status = status;
      if (updatedAt) parsed.updatedAt = updatedAt;
      return parsed;
    })
    .filter((row): row is FdaDeviceShortageRow => row != null);
}

export function normalizeFdaDeviceShortage(
  row: FdaDeviceShortageRow,
  fetchedAt = new Date(),
): NormalizedRiskSignal {
  const severityScore = /discontinued|shortage|limited/iu.test(row.status ?? row.reason ?? "")
    ? 72
    : 50;
  const code = row.productCodes[0];
  return {
    source: fdaDeviceShortagesConnector.id,
    domain: "shortage",
    entityType: "item",
    entityId: code ?? row.device,
    title: `${row.device} device shortage`,
    summary: truncate([row.status, row.reason].filter(Boolean).join(". ")),
    severity: severityScore >= 70 ? "high" : "moderate",
    severityScore,
    confidence: 0.74,
    observedAt: row.updatedAt,
    sourcePublishedAt: row.updatedAt,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(row.updatedAt, fetchedAt),
    evidenceUrl: DEVICE_SHORTAGES_URL,
    raw: {
      device: row.device,
      productCodes: row.productCodes,
      reason: row.reason,
      status: row.status,
      updatedAt: row.updatedAt?.toISOString(),
    },
    // Stable identity only — NOT updatedAt, which changes as FDA revises the
    // SAME device shortage record over time (same reasoning as the drug
    // shortages connector).
    dedupeKey: stableKey(row.device, code),
    matchHints: {
      keywords: [row.device, ...row.productCodes].filter(Boolean),
    },
  };
}
