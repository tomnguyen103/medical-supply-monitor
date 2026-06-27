# Project Instructions

## Product Guardrails

This project is a healthcare operations and supply resilience app. It is not clinical decision support.

Do not implement:

- PHI storage
- EHR integration
- Diagnosis or treatment recommendations
- Drug substitution recommendations
- Patient-specific workflows

## Architecture Rules

- Use Clerk Organizations for tenancy.
- Every business table must be tenant-scoped by organization.
- Use a source-agnostic connector layer.
- External providers emit normalized `RiskSignal` records.
- WorldMonitor may be used only as optional enrichment.
- Risk scoring must be deterministic, versioned, explainable, and auditable.
- AI agents may summarize, classify, and draft, but must not own final writes, tenant access, scoring math, or critical alert delivery.

## Stack

- Next.js + React + TypeScript
- Vercel
- Clerk
- Neon Postgres + Drizzle
- Inngest
- Upstash Redis
- LangGraph + LangChain
- LangSmith
- Sentry
- Tailwind + shadcn/ui + lucide-react

## Verification Expectations

Before considering a feature done:

- Run typecheck.
- Run relevant tests.
- Verify tenant isolation for any data access change.
- Verify no sensitive payloads are sent to analytics, AI traces, or logs.
- Confirm alerts and briefs include evidence, freshness, and confidence.
