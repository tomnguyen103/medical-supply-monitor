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

const OFAC_SDN_XML_URL =
  "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML";

export const ofacSanctionsConnector: Connector = {
  id: "ofac_sanctions",
  name: "OFAC Sanctions",
  domain: "sanctions",
  description:
    "OFAC Specially Designated Nationals list. Matches supplier names and countries.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch(ctx) {
    return fetchOfacSanctions(ctx);
  },
};

export async function fetchOfacSanctions(
  ctx: ConnectorContext,
): Promise<NormalizedRiskSignal[]> {
  const xml = await fetchText(OFAC_SDN_XML_URL, ctx, "application/xml");
  const now = new Date();
  return normalizeOfacSdnXml(xml, now).slice(0, DEFAULT_CONNECTOR_LIMIT);
}

export function normalizeOfacSdnXml(
  xml: string,
  fetchedAt = new Date(),
): NormalizedRiskSignal[] {
  const publicationDate = parseDate(
    extractFirst(xml, /<Publish_Date>([\s\S]*?)<\/Publish_Date>/iu) ??
      extractFirst(xml, /<publshInformation>[\s\S]*?<Publish_Date>([\s\S]*?)<\/Publish_Date>/iu),
  );
  const entries = xml.match(/<sdnEntry>[\s\S]*?<\/sdnEntry>/giu) ?? [];

  return entries
    .map<NormalizedRiskSignal | null>((entry) => {
      const uid = cleanXml(extractFirst(entry, /<uid>([\s\S]*?)<\/uid>/iu));
      const firstName = cleanXml(extractFirst(entry, /<firstName>([\s\S]*?)<\/firstName>/iu));
      const lastName = cleanXml(extractFirst(entry, /<lastName>([\s\S]*?)<\/lastName>/iu));
      const name = [firstName, lastName].filter(Boolean).join(" ").trim();
      if (!name) return null;
      const country = cleanXml(extractFirst(entry, /<country>([\s\S]*?)<\/country>/iu));
      const programs = [...entry.matchAll(/<program>([\s\S]*?)<\/program>/giu)]
        .map((match) => cleanXml(match[1]))
        .filter((value): value is string => Boolean(value));

      return {
        source: ofacSanctionsConnector.id,
        domain: "sanctions",
        entityType: "supplier",
        entityId: uid ?? name,
        title: `OFAC sanctioned entity: ${name}`,
        summary: truncate(
          [programs.length ? `Programs: ${programs.join(", ")}` : null, country]
            .filter(Boolean)
            .join(". ") || "OFAC SDN list entry.",
        ),
        severity: "critical",
        severityScore: 96,
        confidence: 0.95,
        observedAt: publicationDate,
        sourcePublishedAt: publicationDate,
        lastFetchedAt: fetchedAt,
        stalenessStatus: stalenessFromDate(publicationDate, fetchedAt),
        evidenceUrl: "https://sanctionslist.ofac.treas.gov/Home/SdnList",
        raw: {
          uid,
          name,
          country,
          programs,
        },
        dedupeKey: stableKey(uid ?? name),
        matchHints: {
          supplierName: name,
          countryCode: country,
          keywords: [name, country, ...programs].filter(
            (value): value is string => Boolean(value),
          ),
        },
      };
    })
    .filter((signal): signal is NormalizedRiskSignal => signal != null);
}

function extractFirst(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function cleanXml(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = textFromHtml(value);
  return cleaned || undefined;
}
