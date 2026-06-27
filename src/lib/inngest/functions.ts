import { runDailyBriefWorkflows } from "@/lib/ai/graph";
import { runAlertEvaluation } from "@/lib/alerts/engine";
import { runRiskIngestion } from "@/lib/ingestion/pipeline";
import { runRiskScoring } from "@/lib/risk/snapshots";
import { inngest } from "./client";

/**
 * Daily risk refresh.
 *
 * Scheduled daily in Phase 5, with the event trigger kept for manual refreshes.
 * Critical alert delivery remains blocked behind human approval tasks.
 */
export const dailyRiskRefresh = inngest.createFunction(
  {
    id: "daily-risk-refresh",
    name: "Daily Risk Refresh",
    triggers: [{ event: "app/risk.refresh.requested" }, { cron: "0 12 * * *" }],
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
    const alerts = await step.run("evaluate-alerts-and-briefs", async () => {
      return runAlertEvaluation();
    });
    if (!alerts.ok) {
      throw new Error(
        [
          "Risk refresh alert evaluation failed.",
          `alerts_failed=${alerts.failed}`,
          `alerts_skipped=${alerts.skipped ?? "none"}`,
        ].join(" "),
      );
    }
    const ai = await step.run("run-ai-workflow", async () => {
      return runDailyBriefWorkflows();
    });
    if (!ai.ok) {
      throw new Error(
        [
          "Risk refresh AI workflow failed.",
          `ai_failed=${ai.failed}`,
          `ai_skipped=${ai.skipped ?? "none"}`,
        ].join(" "),
      );
    }
    return {
      ok: ingestion.ok && scoring.ok && alerts.ok && ai.ok,
      ingestion,
      scoring,
      alerts,
      ai,
    };
  },
);

/** All Inngest functions served at /api/inngest. */
export const functions = [dailyRiskRefresh];
