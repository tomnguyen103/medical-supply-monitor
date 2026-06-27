import { runRiskIngestion } from "@/lib/ingestion/pipeline";
import { runRiskScoring } from "@/lib/risk/snapshots";
import { inngest } from "./client";

/**
 * Daily risk refresh.
 *
 * Event-triggered for Phases 3-4. Phase 5 switches this to a schedule and
 * appends alert evaluation, human approval, and delivery.
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
    const scoring = await step.run("score-risk-snapshots", async () => {
      return runRiskScoring();
    });
    if (!ingestion.ok || !scoring.ok) {
      throw new Error(
        [
          "Risk refresh failed.",
          `ingestion_failed=${ingestion.failed}`,
          `ingestion_skipped=${ingestion.skipped ?? "none"}`,
          `scoring_failed=${scoring.failed}`,
          `scoring_skipped=${scoring.skipped ?? "none"}`,
        ].join(" "),
      );
    }
    return { ok: ingestion.ok && scoring.ok, ingestion, scoring };
  },
);

/** All Inngest functions served at /api/inngest. */
export const functions = [dailyRiskRefresh];
