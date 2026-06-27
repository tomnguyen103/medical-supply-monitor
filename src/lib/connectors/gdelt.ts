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

const GDELT_URL =
  "https://api.gdeltproject.org/api/v2/doc/doc?query=" +
  encodeURIComponent(
    '(medical supply shortage OR hospital supply shortage OR drug shortage OR device recall OR "FDA recall")',
  ) +
  `&mode=ArtList&format=json&maxrecords=${DEFAULT_CONNECTOR_LIMIT}&timespan=1d`;

export const gdeltConnector: Connector = {
  id: "gdelt_supply_news",
  name: "GDELT Supply News",
  domain: "geopolitical",
  description:
    "GDELT news confirmation for medical supply disruptions. Matches by item, supplier, and country keywords.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchGdeltSupplyNews(ctx);
  },
};

interface GdeltResponse {
  articles?: unknown[];
}

export async function fetchGdeltSupplyNews(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const payload = await fetchJson<GdeltResponse>(GDELT_URL, ctx);
  const now = new Date();
  return (payload.articles ?? [])
    .slice(0, DEFAULT_CONNECTOR_LIMIT)
    .map((article) => normalizeGdeltArticle(article, now))
    .filter((signal): signal is NormalizedRiskSignal => signal != null);
}

export function normalizeGdeltArticle(
  article: unknown,
  fetchedAt = new Date(),
): NormalizedRiskSignal | null {
  const record = asRecord(article);
  if (!record) return null;
  const url = asString(record.url);
  const title = asString(record.title);
  if (!url || !title) return null;
  const publishedAt = parseDate(record.seendate);
  const sourceCountry = asString(record.sourcecountry);
  const domain = asString(record.domain);

  return {
    source: gdeltConnector.id,
    domain: "geopolitical",
    entityType: "other",
    entityId: url,
    title,
    summary: truncate(
      [domain, sourceCountry].filter(Boolean).join(". ") ||
        "GDELT article matching supply disruption terms.",
    ),
    severity: "moderate",
    severityScore: 46,
    confidence: 0.48,
    observedAt: publishedAt,
    sourcePublishedAt: publishedAt,
    lastFetchedAt: fetchedAt,
    stalenessStatus: stalenessFromDate(publishedAt, fetchedAt),
    evidenceUrl: url,
    raw: record,
    dedupeKey: stableKey(url, publishedAt?.toISOString()),
    matchHints: {
      countryCode: sourceCountry,
      keywords: [title, domain, sourceCountry].filter((value): value is string =>
        Boolean(value),
      ),
    },
  };
}
