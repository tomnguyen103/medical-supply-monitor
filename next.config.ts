import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray lockfile in a parent
  // directory otherwise makes Next infer the wrong root for file tracing.
  turbopack: {
    root: import.meta.dirname,
  },
  // Typecheck is enforced separately via `npm run typecheck` and in CI, so the
  // build does not silently pass on type errors.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Note: Next.js 16 removed the built-in `next lint` step and the `eslint`
  // config key, so the build never runs ESLint. Run `npm run lint` explicitly.
};

// Sentry only wraps the config when a DSN is present, so the foundation builds
// cleanly with zero credentials. Setting NEXT_PUBLIC_SENTRY_DSN activates it;
// source-map upload additionally requires SENTRY_AUTH_TOKEN.
const config: NextConfig = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? withSentryConfig(nextConfig, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
      disableLogger: true,
    })
  : nextConfig;

export default config;
