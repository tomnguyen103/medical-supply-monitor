import { Inngest } from "inngest";

import { env } from "@/lib/env";

/**
 * Inngest client for background ingestion / scoring / alert jobs.
 *
 * The event key is optional in local dev (the Inngest Dev Server runs without
 * one). In production, INNGEST_EVENT_KEY / INNGEST_SIGNING_KEY come from env.
 */
export const inngest = new Inngest({
  id: "medical-supply-monitor",
  eventKey: env.inngest.eventKey,
  // Default to dev mode locally when no signing key is set, so the
  // /api/inngest endpoint serves a 200 instead of erroring in cloud mode.
  // In production (or when a signing key exists) this is false → cloud mode.
  isDev: process.env.NODE_ENV !== "production" && !env.inngest.signingKey,
});
