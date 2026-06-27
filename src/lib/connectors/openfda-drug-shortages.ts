import type { Connector } from "./types";

/**
 * openFDA drug shortages connector — STUB (Phase 3).
 *
 * Will fetch https://api.fda.gov/drug/shortages.json, normalize each record
 * into a `NormalizedRiskSignal` (domain: "shortage", entityType: "ndc"), and
 * attach freshness from the feed's `update_date`. No API key required.
 */
export const openFdaDrugShortagesConnector: Connector = {
  id: "openfda_drug_shortage",
  name: "openFDA Drug Shortages",
  domain: "shortage",
  description:
    "FDA drug shortage list via openFDA. Matches by NDC / generic name to monitored items.",
  optional: false,
  isConfigured() {
    // Public feed — no key needed.
    return true;
  },
  async fetch() {
    // TODO(Phase 3): fetch + normalize openFDA drug shortage records.
    return [];
  },
};
