/**
 * Central environment access + per-integration "configured" flags.
 *
 * Design goal: the app must BOOT with zero credentials. Nothing here throws at
 * import time. Each integration exposes a boolean so callers can degrade
 * gracefully ("not configured" UI) instead of crashing. Use `requireEnv` only
 * at the point a feature is actually invoked.
 *
 * Client safety: Next.js inlines only `NEXT_PUBLIC_*` vars into client bundles;
 * server-only secrets read as `undefined` on the client and are never shipped.
 * Flags the client relies on (clerk, sentry) are derived from public vars.
 */

function present(value: string | undefined | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export const env = {
  app: {
    url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    nodeEnv: process.env.NODE_ENV ?? "development",
    isProduction: process.env.NODE_ENV === "production",
  },
  clerk: {
    publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    secretKey: process.env.CLERK_SECRET_KEY,
    signInUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "/sign-in",
    signUpUrl: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL ?? "/sign-up",
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  },
  inngest: {
    eventKey: process.env.INNGEST_EVENT_KEY,
    signingKey: process.env.INNGEST_SIGNING_KEY,
  },
  sentry: {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
  },
  langsmith: {
    tracing: process.env.LANGSMITH_TRACING === "true",
    apiKey: process.env.LANGSMITH_API_KEY,
    project: process.env.LANGSMITH_PROJECT ?? "medical-supply-monitor",
    endpoint: process.env.LANGSMITH_ENDPOINT ?? "https://api.smith.langchain.com",
  },
  ai: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  },
  notifications: {
    resendApiKey: process.env.RESEND_API_KEY,
    alertFromEmail: process.env.ALERT_FROM_EMAIL,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
  },
  connectors: {
    userAgent:
      process.env.RISK_FEED_USER_AGENT ??
      "medical-supply-monitor (configure RISK_FEED_USER_AGENT)",
    nasaFirmsMapKey: process.env.NASA_FIRMS_MAP_KEY,
    // WorldMonitor is OPTIONAL enrichment only — never foundational.
    worldMonitorBaseUrl: process.env.WORLDMONITOR_API_BASE_URL,
    worldMonitorApiKey: process.env.WORLDMONITOR_API_KEY,
  },
} as const;

/**
 * Whether each integration has the minimum config to operate. Reading these is
 * always safe; they never throw.
 */
export const integrations = {
  clerk: present(env.clerk.publishableKey) && present(env.clerk.secretKey),
  /** Public-safe Clerk check for client components (publishable key only). */
  clerkClient: present(env.clerk.publishableKey),
  database: present(env.database.url),
  redis: present(env.redis.url) && present(env.redis.token),
  inngest: present(env.inngest.eventKey) || present(env.inngest.signingKey),
  sentry: present(env.sentry.dsn),
  langsmith: present(env.langsmith.apiKey),
  ai: present(env.ai.anthropicApiKey) || present(env.ai.openaiApiKey),
  resend: present(env.notifications.resendApiKey),
  slack: present(env.notifications.slackWebhookUrl),
  nasaFirms: present(env.connectors.nasaFirmsMapKey),
  worldMonitor:
    present(env.connectors.worldMonitorBaseUrl) &&
    present(env.connectors.worldMonitorApiKey),
} as const;

export type IntegrationName = keyof typeof integrations;

/**
 * Returns the value or throws a clear, actionable error. Call this lazily at
 * the point of use — never at module top-level — so the app still boots when an
 * integration is unconfigured.
 */
export function requireEnv(value: string | undefined | null, name: string): string {
  if (!present(value)) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Add it to .env.local (see .env.example) to enable this feature.`,
    );
  }
  return value;
}
