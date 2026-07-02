import * as Sentry from "@sentry/nextjs";

import { runDailyBriefWorkflows, type AiWorkflowRunSummary } from "@/lib/ai/graph";
import { runAlertEvaluation, type AlertEvaluationSummary } from "@/lib/alerts/engine";
import { runRiskIngestion, type IngestionRunSummary } from "@/lib/ingestion/pipeline";
import { runRetentionCleanup } from "@/lib/retention";
import { runRiskScoring, type RiskScoringRunSummary } from "@/lib/risk/snapshots";
import { inngest } from "./client";

/**
 * "Total failure" gates for the daily pipeline — deliberately stricter than
 * `!summary.ok` (any single row/tenant failing). Retrying the whole Inngest
 * function on a partial failure is actively harmful here: step.run()
 * memoizes ingestion/scoring, so a retry re-evaluates alerts against stale
 * (not re-fetched) data while wasting a retry attempt. Partial failures are
 * already isolated per-connector/per-tenant and reported to Sentry at their
 * source — only a genuinely systemic failure (nothing succeeded at all)
 * should abort and retry the whole run.
 */
export function ingestionTotallyFailed(ingestion: IngestionRunSummary): boolean {
  if (ingestion.skipped) return false;
  return ingestion.connectors.length > 0 && ingestion.connectors.every((c) => c.error !== undefined);
}

export function scoringTotallyFailed(scoring: RiskScoringRunSummary): boolean {
  if (scoring.skipped) return false;
  // Every considered item ends up in exactly one bucket — scoreTenant()
  // increments either `snapshots` or `failed`, never neither (see
  // src/lib/risk/snapshots.ts). So `items === 0` means "nothing to score"
  // (e.g. a freshly onboarded org with no catalog yet) — NOT a failure, and
  // must not trip this gate. Only `failed === items` (with items > 0) means
  // everything that was attempted actually failed.
  return scoring.items > 0 && scoring.failed === scoring.items;
}

export function alertsTotallyFailed(alerts: AlertEvaluationSummary): boolean {
  if (alerts.skipped) return false;
  return alerts.tenants > 0 && alerts.tenantsFailed === alerts.tenants;
}

export function aiWorkflowTotallyFailed(ai: AiWorkflowRunSummary): boolean {
  if (ai.skipped) return false;
  return ai.tenants > 0 && ai.failed === ai.tenants;
}

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
    try {
      const ingestion = await step.run("ingest-risk-signals", async () => {
        return runRiskIngestion();
      });
      const scoring = await step.run("score-risk-snapshots", async () => {
        return runRiskScoring();
      });
      if (ingestionTotallyFailed(ingestion) || scoringTotallyFailed(scoring)) {
        throw new Error(
          [
            "Risk refresh failed — nothing succeeded.",
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
      if (alertsTotallyFailed(alerts)) {
        throw new Error(
          [
            "Risk refresh alert evaluation failed — every org errored.",
            `alerts_tenants_failed=${alerts.tenantsFailed}`,
            `alerts_skipped=${alerts.skipped ?? "none"}`,
          ].join(" "),
        );
      }

      const ai = await step.run("run-ai-workflow", async () => {
        return runDailyBriefWorkflows();
      });
      if (aiWorkflowTotallyFailed(ai)) {
        throw new Error(
          [
            "Risk refresh AI workflow failed — every org errored.",
            `ai_failed=${ai.failed}`,
            `ai_skipped=${ai.skipped ?? "none"}`,
          ].join(" "),
        );
      }

      return {
        // Reaching here already means no total-failure gate tripped; `ok`
        // still reports whether every step was fully clean (no partial
        // failures) vs. merely "not a systemic failure" — informational
        // only, nothing in this codebase reads this return value today.
        ok: ingestion.ok && scoring.ok && alerts.ok && ai.ok,
        ingestion,
        scoring,
        alerts,
        ai,
      };
    } catch (error) {
      Sentry.captureException(error, { extra: { function: "daily-risk-refresh" } });
      throw error;
    }
  },
);

export const retentionCleanup = inngest.createFunction(
  {
    id: "retention-cleanup",
    name: "Retention Cleanup",
    triggers: [{ cron: "30 3 * * *" }],
  },
  async ({ step }) => {
    try {
      const retention = await step.run("cleanup-retained-data", async () => {
        return runRetentionCleanup({ apply: true });
      });
      if (retention.skipped === "database-unconfigured") {
        return retention;
      }
      if (!retention.ok) {
        throw new Error(
          [
            "Retention cleanup failed.",
            `retention_skipped=${retention.skipped ?? "none"}`,
          ].join(" "),
        );
      }
      return retention;
    } catch (error) {
      Sentry.captureException(error, { extra: { function: "retention-cleanup" } });
      throw error;
    }
  },
);

/** All Inngest functions served at /api/inngest. */
export const functions = [dailyRiskRefresh, retentionCleanup];
