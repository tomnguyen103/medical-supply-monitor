import type { Connector, ConnectorContext, NormalizedRiskSignal } from "./types";
import {
  DEFAULT_CONNECTOR_LIMIT,
  asRecord,
  asString,
  fetchJson,
  parseDate,
  severityFromScore,
  stableKey,
  stalenessFromDate,
  truncate,
} from "./helpers";

const NWS_ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

export const nwsAlertsConnector: Connector = {
  id: "nws_alert",
  name: "NWS/NOAA Weather Alerts",
  domain: "weather",
  description:
    "National Weather Service active alerts. Matches by US supplier country and region keywords.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchNwsAlerts(ctx);
  },
};

interface NwsAlertResponse {
  features?: unknown[];
}

export async function fetchNwsAlerts(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const payload = await fetchJson<NwsAlertResponse>(NWS_ALERTS_URL, ctx);
  const now = new Date();
  return (payload.features ?? [])
    .slice(0, DEFAULT_CONNECTOR_LIMIT)
    .map((feature) => normalizeNwsAlert(feature, now))
    .filter((signal): signal is NormalizedRiskSignal => signal != null);
}

export function normalizeNwsAlert(
  feature: unknown,
  fetchedAt = new Date(),
): NormalizedRiskSignal | null {
  const record = asRecord(feature);
  const props = asRecord(record?.properties);
  if (!record || !props) return null;

  const id = asString(props.id) ?? asString(record.id);
  const event = asString(props.event);
  const area = asString(props.areaDesc);
  const severity = asString(props.severity);
  const certainty = asString(props.certainty);
  const effective = parseDate(props.effective);
  const sent = parseDate(props.sent);
  const score = weatherScore(severity);

  return {
    source: nwsAlertsConnector.id,
    domain: "weather",
    entityType: "region",
    entityId: id ?? area ?? null,
    title: `${event ?? "Weather alert"}${area ? ` for ${area}` : ""}`,
    summary: truncate(asString(props.headline) ?? asString(props.description) ?? ""),
    severity: severityFromScore(score),
    severityScore: score,
    confidence: certaintyScore(certainty),
    observedAt: effective ?? sent,
    sourcePublishedAt: sent ?? effective,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(effective ?? sent, fetchedAt),
    evidenceUrl: asString(props.uri) ?? id,
    raw: record,
    dedupeKey: stableKey(id, event, sent?.toISOString()),
    matchHints: {
      countryCode: "US",
      keywords: [area, event].filter((value): value is string => Boolean(value)),
    },
  };
}

function weatherScore(severity: string | undefined): number {
  switch (severity?.toLowerCase()) {
    case "extreme":
      return 92;
    case "severe":
      return 76;
    case "moderate":
      return 55;
    case "minor":
      return 28;
    default:
      return 40;
  }
}

function certaintyScore(certainty: string | undefined): number {
  switch (certainty?.toLowerCase()) {
    case "observed":
      return 0.9;
    case "likely":
      return 0.78;
    case "possible":
      return 0.58;
    default:
      return 0.5;
  }
}
