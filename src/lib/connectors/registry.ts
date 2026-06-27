import type { Connector } from "./types";
import { cisaKevConnector } from "./cisa-kev";
import { fdaDeviceShortagesConnector } from "./fda-device-shortages";
import { gdeltConnector } from "./gdelt";
import { nasaFirmsConnector } from "./nasa-firms";
import { nwsAlertsConnector } from "./nws-alerts";
import { ofacSanctionsConnector } from "./ofac-sanctions";
import { openFdaDrugShortagesConnector } from "./openfda-drug-shortages";
import { openFdaRecallsConnector } from "./openfda-recalls";
import { usgsEarthquakesConnector } from "./usgs-earthquakes";
import { worldMonitorConnector } from "./worldmonitor";

/**
 * The connector registry. Adding a provider means implementing `Connector` and
 * appending it here. The ingestion pipeline iterates this list and never
 * references any provider directly.
 */
export const connectors: readonly Connector[] = [
  openFdaDrugShortagesConnector,
  openFdaRecallsConnector,
  fdaDeviceShortagesConnector,
  ofacSanctionsConnector,
  cisaKevConnector,
  usgsEarthquakesConnector,
  nasaFirmsConnector,
  nwsAlertsConnector,
  gdeltConnector,
  // Optional enrichment. It must remain non-foundational.
  worldMonitorConnector,
];

/** Connectors that are ready to run. Optional/keyed feeds opt out when unset. */
export function getActiveConnectors(): Connector[] {
  return connectors.filter((c) => c.isConfigured());
}

export function getConnector(id: string): Connector | undefined {
  return connectors.find((c) => c.id === id);
}
