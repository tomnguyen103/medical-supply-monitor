import * as Sentry from "@sentry/nextjs";

// Edge-runtime Sentry init (middleware, edge routes). No-op without a DSN.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    debug: false,
  });
}
