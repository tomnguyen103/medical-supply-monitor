import { env, integrations } from "@/lib/env";
import { parseCsv } from "@/lib/import/csv";
import type { Connector, ConnectorContext, NormalizedRiskSignal } from "./types";
import {
  DEFAULT_CONNECTOR_LIMIT,
  asNumber,
  asString,
  fetchText,
  parseDate,
  severityFromScore,
  stableKey,
  stalenessFromDate,
} from "./helpers";

const FIRMS_SOURCE = "VIIRS_SNPP_NRT";

export const nasaFirmsConnector: Connector = {
  id: "nasa_firms",
  name: "NASA FIRMS Fire Detections",
  domain: "disaster",
  description:
    "NASA FIRMS active fire detections. Optional because it requires a FIRMS map key.",
  optional: false,
  isConfigured() {
    return integrations.nasaFirms;
  },
  async fetch(ctx) {
    return fetchNasaFirms(ctx);
  },
};

export async function fetchNasaFirms(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  if (!integrations.nasaFirms || !env.connectors.nasaFirmsMapKey) return [];
  const url =
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/" +
    `${encodeURIComponent(env.connectors.nasaFirmsMapKey)}/${FIRMS_SOURCE}/world/1`;
  const csv = await fetchText(url, ctx, "text/csv");
  const now = new Date();
  return parseCsv(csv)
    .rows.slice(0, DEFAULT_CONNECTOR_LIMIT)
    .map((row) => normalizeNasaFirmsRow(row, now))
    .filter((signal): signal is NormalizedRiskSignal => signal != null);
}

export function normalizeNasaFirmsRow(
  row: Record<string, unknown>,
  fetchedAt = new Date(),
): NormalizedRiskSignal | null {
  const lat = asString(row.latitude);
  const lon = asString(row.longitude);
  const date = asString(row.acq_date);
  if (!lat || !lon || !date) return null;
  const acquisition = parseDate(
    `${date}T${formatFirmsTime(asString(row.acq_time)) ?? "00:00"}:00Z`,
  );
  const confidence = parseFirmsConfidence(row.confidence);
  const frp = asNumber(Number(row.frp));
  const score = Math.min(95, 35 + confidence * 40 + Math.min(frp ?? 0, 80) * 0.25);
  const region = `${Number(lat).toFixed(2)},${Number(lon).toFixed(2)}`;

  return {
    source: nasaFirmsConnector.id,
    domain: "disaster",
    entityType: "region",
    entityId: region,
    title: `Active fire detection near ${region}`,
    summary: `NASA FIRMS ${FIRMS_SOURCE} detection with confidence ${asString(
      row.confidence,
    ) ?? "unknown"}.`,
    severity: severityFromScore(score),
    severityScore: score,
    confidence,
    observedAt: acquisition,
    sourcePublishedAt: acquisition,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(acquisition, fetchedAt),
    evidenceUrl: "https://firms.modaps.eosdis.nasa.gov/",
    raw: row,
    dedupeKey: stableKey(date, asString(row.acq_time), lat, lon, asString(row.satellite)),
    matchHints: {
      keywords: [region, "wildfire", "fire"].filter(Boolean),
    },
  };
}

function formatFirmsTime(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const padded = value.padStart(4, "0");
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}`;
}

function parseFirmsConfidence(value: unknown): number {
  const raw = asString(value)?.toLowerCase();
  if (raw === "h") return 0.9;
  if (raw === "n") return 0.7;
  if (raw === "l") return 0.45;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric / 100)) : 0.5;
}
