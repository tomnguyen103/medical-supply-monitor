import type { Connector, ConnectorContext, NormalizedRiskSignal } from "./types";
import {
  DEFAULT_CONNECTOR_LIMIT,
  asNumber,
  asRecord,
  asString,
  fetchJson,
  severityFromScore,
  stableKey,
  stalenessFromDate,
  truncate,
} from "./helpers";

const USGS_SIGNIFICANT_WEEK_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_week.geojson";

export const usgsEarthquakesConnector: Connector = {
  id: "usgs_earthquake",
  name: "USGS Earthquakes",
  domain: "disaster",
  description:
    "USGS significant earthquake GeoJSON feed. Matches by supplier country or region keywords when available.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchUsgsEarthquakes(ctx);
  },
};

interface UsgsFeatureCollection {
  features?: unknown[];
}

export async function fetchUsgsEarthquakes(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const payload = await fetchJson<UsgsFeatureCollection>(USGS_SIGNIFICANT_WEEK_URL, ctx);
  const now = new Date();
  return (payload.features ?? [])
    .slice(0, DEFAULT_CONNECTOR_LIMIT)
    .map((feature) => normalizeUsgsEarthquake(feature, now))
    .filter((signal): signal is NormalizedRiskSignal => signal != null);
}

export function normalizeUsgsEarthquake(
  feature: unknown,
  fetchedAt = new Date(),
): NormalizedRiskSignal | null {
  const record = asRecord(feature);
  const props = asRecord(record?.properties);
  if (!record || !props) return null;

  const id = asString(record.id);
  const mag = asNumber(props.mag);
  const place = asString(props.place);
  const timeMs = asNumber(props.time);
  const observedAt = timeMs ? new Date(timeMs) : undefined;
  const url = asString(props.url);
  const score = mag == null ? 45 : Math.min(100, Math.max(20, mag * 13));

  return {
    source: usgsEarthquakesConnector.id,
    domain: "disaster",
    entityType: "region",
    entityId: id ?? place ?? null,
    title: `Magnitude ${mag ?? "unknown"} earthquake${place ? ` near ${place}` : ""}`,
    summary: truncate(asString(props.title) ?? "USGS significant earthquake event."),
    severity: severityFromScore(score),
    severityScore: score,
    confidence: 0.88,
    observedAt,
    sourcePublishedAt: observedAt,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(observedAt, fetchedAt),
    evidenceUrl: url,
    raw: record,
    dedupeKey: stableKey(id, observedAt?.toISOString()),
    matchHints: {
      keywords: [place].filter((value): value is string => Boolean(value)),
    },
  };
}
