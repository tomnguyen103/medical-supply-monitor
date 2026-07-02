# Critical Medical Supply Resilience Monitor

![Status](https://img.shields.io/badge/status-Phase_7_hardened_MVP-0f766e)
![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Drizzle](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)

## About

A healthcare operations SaaS that helps hospital supply chain and pharmacy
procurement teams monitor critical medical supplies, shortages, recalls,
supplier exposure, and disruption risk. It turns scattered feeds (FDA shortages
and recalls, supplier exposure, weather, sanctions, cyber, and inventory) into
one daily, evidence-backed brief of what changed and what to review.

> Which critical supplies are at risk, why, what changed, and what should our
> team review?

It is built deliberately as a supply-resilience tool, **not** clinical decision
support: no PHI, no EHR integration, and no diagnosis, treatment, or
substitution advice. Risk scoring is deterministic, versioned, and explainable;
AI assists with summaries and drafts but never owns scoring, tenant access,
final writes, or critical alert delivery. See [Product guardrails](#product-guardrails).

---

## Status: Phase 7 (Hardened MVP)

This repository currently contains the Phase 1 foundation, Phase 2 catalog/import
workflow, Phase 3 ingestion loop, Phase 4 scoring loop, Phase 5 alert/brief
loop, Phase 6 guarded AI workflow, and Phase 7 production hardening:

- Next.js 16 / React 19 / TypeScript app, Vercel-ready
- Clerk Organizations wiring (auth + tenancy), conditional and graceful
- Neon Postgres + Drizzle ORM with the first schema draft
- Inngest background-job scaffold + `/api/inngest` route
- Upstash Redis client + rate-limit helper
- Sentry instrumentation (client / server / edge)
- LangSmith config + a compiled LangGraph supervisor workflow
- Source-agnostic connector layer emitting a generic `RiskSignal`
- Public feed connectors for openFDA shortages and recalls, FDA device
  shortages, OFAC, CISA KEV, USGS, NWS/NOAA, GDELT, plus keyed NASA FIRMS
- Deterministic, versioned, explainable scoring with freshness decay, domain
  weights, sole-source exposure, days-on-hand, and persisted risk snapshots
- CSV import population for item identifiers such as NDC, GTIN, UPC, SKU, MPN,
  FDA application number, and RxCUI
- Scheduled and event-triggered Inngest risk refresh that matches normalized
  signals, scores snapshots, evaluates alert rules, and creates daily briefs
- Tenant-scoped risk signals dashboard with severity, freshness, confidence,
  matched item/supplier, current score, evidence drawer, and score rationale
- Alert rules CRUD, cooldown-aware evaluation, alert event history, in-app daily
  briefs, Slack/email delivery hooks, and human approval tasks for critical alerts
- LangGraph workflow agents that draft risk brief and import-mapping summaries,
  with a code-owned deterministic scorer node, compliance guard, critical
  human-approval gate, LangSmith-safe traces, and tenant-scoped `agent_runs`
  audit records
- Clerk organization role checks on mutating actions, Upstash-backed action
  rate limits, `audit_log` writes, scheduled retention cleanup, tenant-isolation
  tests, and a non-PHI buyer-ready demo workspace seed
- Protected dashboard shell + landing and auth surfaces

Every integration **boots gracefully without credentials** ("not configured"
state), so you can run the app immediately and switch features on by adding env
vars. With Clerk and Neon configured, seed the demo workspace from the overview
to exercise the MVP loop: upload/catalog data, matched risk, score, brief, alert,
evidence, and approval gates.

---

## Quick start

```bash
# 1. Install dependencies (an .npmrc sets legacy-peer-deps for this multi-integration stack)
npm install

# 2. Create your local env file and fill in what you need (all optional to boot)
cp .env.example .env.local

# 3. Run the dev server
npm run dev
# -> http://localhost:3000
```

With no env values set, you get the landing page, the auth pages in a
"not configured" state, and a previewable dashboard shell at `/dashboard`.

### Turn integrations on

Fill the relevant keys in `.env.local` (see `.env.example` for the full list):

| Integration | Env vars | Enables |
| --- | --- | --- |
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Sign-in/up, orgs, protected routes |
| Neon + Drizzle | `DATABASE_URL` | Database reads/writes, migrations |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_*` for source maps) | Error monitoring |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Cache, rate limits, cooldowns |
| Inngest | `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` | Background jobs in production |
| LangSmith | `LANGSMITH_API_KEY` (+ `LANGSMITH_TRACING=true`) | AI tracing / evals |
| AI provider | `OPENAI_API_KEY` or `GEMINI_API_KEY`; optional `LOCAL_LLM_BASE_URL` backup | LangGraph agents |
| Notifications | `RESEND_API_KEY`, `ALERT_FROM_EMAIL`, `ALERT_TO_EMAIL`, `SLACK_WEBHOOK_URL` | Email and Slack alert delivery |

---

## Database

The schema draft lives in [`src/lib/db/schema.ts`](src/lib/db/schema.ts).

```bash
npm run db:generate   # generate SQL migrations from the schema (offline, no DB needed)
npm run db:migrate    # apply migrations (requires DATABASE_URL)
npm run db:push       # push schema directly (dev convenience)
npm run db:studio     # open Drizzle Studio
```

Tenancy: `organizations.id` is the Clerk organization id. Every business table
is scoped by `organization_id` and is filtered by it for tenant isolation.

---

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:*` | Drizzle migrations / studio (see above) |

---

## Architecture

```text
Vercel Next.js app
 -> Clerk auth/orgs (tenancy)            src/proxy.ts, src/lib/auth/tenancy.ts
 -> Neon Postgres via Drizzle           src/lib/db/*
 -> Inngest jobs (ingest/score/alert)   src/lib/inngest/*, src/app/api/inngest/route.ts
 -> Upstash Redis (cache/cooldowns)     src/lib/redis/*
 -> Connectors -> RiskSignal            src/lib/connectors/*
 -> Deterministic scoring (versioned)   src/lib/risk/scoring.ts
 -> LangGraph workflows (drafts only)   src/lib/ai/*
 -> Sentry monitoring                   src/instrumentation*.ts, src/sentry.*.config.ts
```

**Data strategy:** every external provider implements the `Connector` interface
and emits a normalized `RiskSignal` (with freshness + evidence). The product is
source-agnostic and survives the loss of any single feed. WorldMonitor is an
**optional enrichment connector only**, never foundational.

**Scoring:** deterministic, versioned (`SCORING_VERSION`), and explainable (a
structured component breakdown is stored on every snapshot). AI never computes
the score.

---

## Product guardrails

These are enforced in the data model and architecture, not toggles:

- No PHI and no patient-level data
- No EHR integration
- No diagnosis, treatment, or drug-substitution recommendations
- No black-box scoring (deterministic, versioned, explainable, auditable)
- Human approval for critical alerts
- WorldMonitor optional, never foundational
- Every alert shows evidence, freshness, and confidence
- AI agents may summarize / classify / draft, but never own tenant access,
  scoring math, final writes, or critical alert delivery

---

## Deployment (Vercel)

- Production branch: `main`; preview deployments on every PR
- Set the env groups (`development`, `preview`, `production`) in Vercel
- Run migrations via a controlled release step, not automatically on previews
- The Inngest endpoint is exposed at `/api/inngest`
- CI (lint, typecheck, test, build) runs on every PR and on `main` via
  [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full cold-start
checklist (env, migrations, Inngest Cloud sync, Clerk org setup) and the
migration rollback procedure, [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)
for the full plan and phase breakdown, and [`AGENTS.md`](AGENTS.md) for the
working agreement.
