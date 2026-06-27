import * as Sentry from "@sentry/nextjs";

/**
 * Next.js instrumentation hook. Loads the right Sentry config per runtime, only
 * when a DSN is present, so the foundation runs without Sentry configured.
 */
export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures nested React Server Component errors for Sentry (no-op without init).
export const onRequestError = Sentry.captureRequestError;
