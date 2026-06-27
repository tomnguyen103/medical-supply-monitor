import type { Connector } from "./types";

/**
 * openFDA drug/device recalls connector — STUB (Phase 3).
 *
 * Will fetch https://api.fda.gov/drug/enforcement.json and
 * https://api.fda.gov/device/enforcement.json, normalizing each enforcement
 * report into a `NormalizedRiskSignal` (domain: "recall"). No API key required.
 */
export const openFdaRecallsConnector: Connector = {
  id: "openfda_recall",
  name: "openFDA Recalls (Drug + Device)",
  domain: "recall",
  description:
    "FDA enforcement / recall reports via openFDA. Matches by NDC, GTIN, or firm name.",
  optional: false,
  isConfigured() {
    return true;
  },
  async fetch() {
    // TODO(Phase 3): fetch + normalize openFDA enforcement records.
    return [];
  },
};
