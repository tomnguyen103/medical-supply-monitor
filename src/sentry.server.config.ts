import * as Sentry from "@sentry/nextjs";

// Server-side Sentry init. No-op unless a DSN is configured, so the app boots
// cleanly without Sentry. Guardrail: PII is never sent by default (no PHI).
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    debug: false,
  });
}
