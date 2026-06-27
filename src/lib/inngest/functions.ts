import { runRiskIngestion } from "@/lib/ingestion/pipeline";
import { inngest } from "./client";

/**
 * Daily risk refresh.
 *
 * Event-triggered for Phase 3. Phase 5 switches this to a schedule and appends
 * scoring, alert evaluation, human approval, and delivery. This phase owns only
 * the connector to normalized RiskSignal ingestion loop.
 */
export const dailyRiskRefresh = inngest.createFunction(
  {
    id: "daily-risk-refresh",
    name: "Daily Risk Refresh",
    triggers: [{ event: "app/risk.refresh.requested" }],
  },
  async ({ step }) => {
    const ingestion = await step.run("ingest-risk-signals", async () => {
      return runRiskIngestion();
    });
    return { ok: ingestion.ok, ingestion };
  },
);

/** All Inngest functions served at /api/inngest. */
export const functions = [dailyRiskRefresh];
