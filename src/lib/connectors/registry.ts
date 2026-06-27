import type { Connector } from "./types";
import { openFdaDrugShortagesConnector } from "./openfda-drug-shortages";
import { openFdaRecallsConnector } from "./openfda-recalls";
import { worldMonitorConnector } from "./worldmonitor";

/**
 * The connector registry. Adding a provider = implement `Connector` and append
 * it here — the ingestion pipeline iterates this list and never references any
 * provider directly. Foundational feeds come first; optional enrichers last.
 *
 * Phase 3 will add: FDA device shortages, OFAC sanctions, CISA KEV, USGS
 * earthquakes, NASA FIRMS, NWS/NOAA weather, GDELT, and customer CSV import.
 */
export const connectors: readonly Connector[] = [
  openFdaDrugShortagesConnector,
  openFdaRecallsConnector,
  // Optional enrichment — must remain non-foundational.
  worldMonitorConnector,
];

/** Connectors that are both non-optional-or-configured and ready to run. */
export function getActiveConnectors(): Connector[] {
  return connectors.filter((c) => c.isConfigured());
}

export function getConnector(id: string): Connector | undefined {
  return connectors.find((c) => c.id === id);
}
