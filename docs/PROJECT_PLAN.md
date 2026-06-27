# Critical Medical Supply Resilience Monitor

## Product Positioning

Build a healthcare operations SaaS that helps hospital supply chain and pharmacy procurement teams monitor critical medical supplies, shortages, recalls, supplier exposure, and disruption risk.

This is not clinical decision support. The MVP must not handle PHI, recommend treatment, recommend drug substitutions, or integrate with EHR systems.

Core promise:

> Which critical supplies are at risk, why, what changed, and what should our team review?

## Target Customer

Primary buyers:

- Hospital supply chain directors
- Pharmacy procurement leaders
- Materials management teams
- Emergency preparedness / incident command teams
- COO/CFO operations sponsors

Best first customer: a regional health system with 2-10 hospitals, active shortage pain, and spreadsheet-heavy supply monitoring.

## Modern Stack

| Layer | Technology |
| --- | --- |
| App | Next.js 16, React 19, TypeScript |
| Deployment | Vercel production + preview deployments |
| Auth / orgs | Clerk Organizations, roles, invitations |
| Database | Neon Postgres |
| ORM | Drizzle ORM |
| Background jobs | Inngest |
| Cache / rate limits | Upstash Redis |
| AI workflows | LangGraph + LangChain |
| AI tracing / evals | LangSmith |
| Error monitoring | Sentry |
| Product analytics | Optional PostHog, privacy-restricted |
| UI | Tailwind CSS, shadcn/ui, lucide-react |
| Tables / charts / maps | TanStack Table, Recharts, MapLibre |
| Notifications | Resend, Slack webhooks, Teams later |

## Architecture

```text
Vercel Next.js app
-> Clerk auth/orgs
-> Neon Postgres via Drizzle
-> Inngest jobs for ingestion/scoring/alerts
-> Upstash Redis for cache, cooldowns, rate limits
-> LangGraph workflows for AI briefs/explanations
-> LangSmith traces/evals
-> Sentry monitoring
-> Resend/Slack notifications
```

WorldMonitor is optional enrichment only. The product must survive without it.

## Data Strategy

Use a source-agnostic connector layer. Every provider emits `RiskSignal`.

MVP connectors:

- Customer CSV: item master, suppliers, inventory, open POs
- FDA/openFDA drug shortages
- openFDA drug/device recalls
- FDA medical device shortage list
- OFAC sanctions
- CISA KEV
- USGS earthquakes
- NASA FIRMS wildfire/fire detections
- NWS/NOAA weather alerts
- GDELT news/event confirmation
- Optional WorldMonitor connector for country/chokepoint/geopolitical context

Every signal stores freshness:

```text
source
domain
entityType
entityId
severity
confidence
observedAt
sourcePublishedAt
lastFetchedAt
stalenessStatus
evidenceUrl
rawPayloadRef
```

## Core Modules

1. Critical Item Catalog
   - Drugs, devices, IV fluids, PPE, oxygen, lab reagents, sterile supplies, high-priority consumables.

2. Supplier Exposure
   - Supplier, distributor, manufacturing country, supplier site, port, route, chokepoint.

3. Inventory + Procurement Signals
   - Days on hand, burn rate, open POs, partial fills, backorders, delayed shipments.

4. Shortage + Recall Intelligence
   - FDA/openFDA ingestion and matching to monitored items.

5. External Risk Overlay
   - Weather, disasters, sanctions, cyber, country risk, infrastructure, route disruption.

6. Risk Engine
   - Deterministic, explainable scoring with freshness labels and evidence.

7. Alerts + Daily Briefs
   - Changed since yesterday, Slack/email alerts, cooldowns, alert audit history.

8. AI Assistant
   - Import mapping, risk explanation, daily brief generation, scenario summaries.

## AI Workflow

Use controlled parallel agents with deterministic gates.

```text
Inngest scheduled job
-> LangGraph supervisor
-> FDA shortage agent
-> recall agent
-> supplier exposure agent
-> inventory agent
-> external risk agent
-> deterministic scorer
-> briefing agent
-> critic/compliance guard
-> human approval if critical
-> send alert
-> trace in LangSmith
```

Agents summarize and draft. They do not control tenant access, scoring math, final writes, or critical alert delivery.

## Key Tables

- `organizations`
- `facilities`
- `items`
- `item_identifiers`
- `suppliers`
- `supplier_sites`
- `item_suppliers`
- `inventory_snapshots`
- `procurement_events`
- `risk_signals`
- `risk_snapshots`
- `alert_rules`
- `alert_events`
- `evidence_artifacts`
- `agent_runs`
- `human_review_tasks`
- `audit_log`

## Vercel Deployment Plan

- Production branch: `main`
- Preview deployments: every PR
- Environment groups: `development`, `preview`, `production`
- Store secrets in Vercel env vars: Clerk, Neon, Upstash, Inngest, LangSmith, Sentry, Resend, Slack
- Run migrations through CI or controlled release commands, not automatically on every preview
- Expose the Inngest endpoint through a Next.js route handler
- Use Vercel previews for customer demos and stakeholder review
- Use Vercel logs plus Sentry for runtime failure triage
- Use Vercel Analytics only if needed; PostHog remains optional for deeper product analytics

## MVP Phases

### Phase 1: Foundation

- Set up Next.js on Vercel.
- Add Clerk org auth and roles.
- Add Neon/Drizzle schema.
- Add Sentry.
- Build protected dashboard shell.

### Phase 2: Catalog + Imports

- Add CSV import.
- Add item list.
- Add supplier list.
- Add facilities.
- Add watchlists and validation.

### Phase 3: Ingestion

- Build connector framework.
- Add FDA/openFDA shortage connector.
- Add recall connector.
- Add inventory import connector.
- Store normalized risk signals.

### Phase 4: Risk Scoring

- Add risk snapshots.
- Add scoring versioning.
- Add evidence drawer.
- Add freshness labels.
- Add changed-since-yesterday logic.

### Phase 5: Alerts + Briefs

- Add alert rules.
- Add Slack/email delivery.
- Add cooldowns.
- Add daily brief.
- Add alert event history.

### Phase 6: AI Workflow

- Add LangGraph agents.
- Add LangSmith traces/evals.
- Add risk explanation assistant.
- Add import mapping assistant.
- Add compliance guard.

### Phase 7: Production Hardening

- Polish RBAC.
- Add audit logs.
- Add rate limits.
- Add backups.
- Add data retention controls.
- Add tenant-isolation tests.
- Add buyer-ready demo workspace.

## MVP Scope

Build the smallest valuable loop:

1. Hospital user signs in with Clerk.
2. User creates or joins an organization.
3. User uploads 100 critical items via CSV.
4. App matches items to shortage/recall signals.
5. App enriches with supplier/external risk.
6. App calculates explainable risk scores.
7. App sends a daily brief and Slack/email alerts.
8. User can open evidence for every alert.

## Guardrails

- No PHI.
- No EHR integration in MVP.
- No diagnosis, treatment, or substitution advice.
- No black-box scoring.
- Human approval for critical alerts.
- WorldMonitor optional, never foundational.
- Every alert must show evidence, freshness, and confidence.

## Expansion Path

- ASHP licensed shortage connector
- ERP/procurement integrations: Workday, Oracle, Infor, SAP
- GPO/distributor feeds
- Teams integration
- Scenario planning
- Medical device disruption module
- Emergency preparedness dashboard
- Regional health system resilience score
- Pharma/life sciences supplier risk module
