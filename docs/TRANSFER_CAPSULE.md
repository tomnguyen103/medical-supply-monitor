# Transfer Capsule

## Current Decision

The project should be built as **Critical Medical Supply Resilience Monitor**, a healthcare operations SaaS for hospital supply chain and pharmacy procurement teams.

The product should not be a clone of WorldMonitor and should not depend on WorldMonitor as a core platform. WorldMonitor can be an optional connector for external risk enrichment.

## Key Product Constraint

Keep MVP outside clinical decision support:

- No PHI
- No patient-level workflows
- No drug substitution recommendations
- No treatment guidance
- No EHR integration

## Main Buyer

Regional health systems, especially pharmacy procurement and supply chain teams that manage shortages using spreadsheets, vendor emails, FDA pages, and manual checks.

## Best MVP Wedge

Upload 100 critical supplies, enrich with FDA/openFDA shortage and recall data, add inventory and supplier risk, produce a daily changed-since-yesterday brief, and send Slack/email alerts with evidence.

## Stack

- Next.js 16, React 19, TypeScript
- Vercel deployment
- Clerk Organizations
- Neon Postgres + Drizzle
- Inngest
- Upstash Redis
- LangGraph + LangChain
- LangSmith
- Sentry
- Optional PostHog
- Tailwind, shadcn/ui, lucide-react
- TanStack Table, Recharts, MapLibre
- Resend, Slack webhooks

## Core Architecture Rule

Every external provider must map into a generic `RiskSignal` shape. Do not hard-code WorldMonitor-specific business logic.

## Next Best Step

Initialize the app in this folder, then implement Phase 1:

1. Create Next.js app.
2. Add Clerk auth/orgs.
3. Add Neon/Drizzle schema.
4. Add protected dashboard shell.
5. Add Sentry.
6. Deploy a first Vercel preview.
