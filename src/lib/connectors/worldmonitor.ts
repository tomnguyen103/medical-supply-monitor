import { env, integrations } from "@/lib/env";
import type { Connector } from "./types";

/**
 * WorldMonitor connector — OPTIONAL enrichment only — STUB (Phase 3).
 *
 * GUARDRAIL: WorldMonitor must never be foundational. The product fully
 * functions without it. It is `optional: true` and only contributes
 * country / chokepoint / geopolitical CONTEXT on top of signals that already
 * exist from first-party feeds. It is disabled unless explicitly configured.
 */
export const worldMonitorConnector: Connector = {
  id: "worldmonitor",
  name: "WorldMonitor (optional enrichment)",
  domain: "geopolitical",
  description:
    "Optional country / chokepoint / geopolitical context. Enrichment only — never required.",
  optional: true,
  isConfigured() {
    return integrations.worldMonitor;
  },
  async fetch() {
    if (!integrations.worldMonitor) return [];
    // TODO(Phase 3): call env.connectors.worldMonitorBaseUrl with the API key
    // and normalize enrichment context into RiskSignals (domain: geopolitical).
    void env.connectors.worldMonitorBaseUrl;
    return [];
  },
};
