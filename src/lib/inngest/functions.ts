import { inngest } from "./client";

/**
 * Daily risk refresh — STUB (wired across Phases 3–5).
 *
 * Event-triggered for now (no surprise cron in production while it is a no-op).
 * Phase 5 switches the trigger to a schedule. The eventual deterministic
 * pipeline: run connectors → normalize to RiskSignals → match to catalog →
 * deterministic score → write snapshots → evaluate alert rules → (human
 * approval for critical) → deliver. Each step is its own `step.run` for
 * retries and observability.
 */
export const dailyRiskRefresh = inngest.createFunction(
  {
    id: "daily-risk-refresh",
    name: "Daily Risk Refresh",
    // Inngest v4: triggers live inside the options object (array form).
    triggers: [{ event: "app/risk.refresh.requested" }],
  },
  async ({ step }) => {
    await step.run("placeholder", async () => {
      // TODO(Phase 3-5): connectors -> signals -> score -> snapshots -> alerts.
      return { ok: true };
    });
    return { ok: true, note: "placeholder; pipeline lands in later phases" };
  },
);

/** All Inngest functions served at /api/inngest. */
export const functions = [dailyRiskRefresh];
