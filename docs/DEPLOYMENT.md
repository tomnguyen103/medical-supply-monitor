# Deployment

This is the cold-start checklist for standing up a new environment (or
recovering an existing one), plus the release and rollback procedure for
schema migrations. It assumes Vercel + Neon + Clerk + Upstash + Inngest Cloud,
matching the stack in [`README.md`](../README.md#deployment-vercel).

CI (`.github/workflows/ci.yml`) runs lint, typecheck, the test suite, and a
production build on every PR and on every push to `main`, with zero
credentials required — the app is designed to boot and build without any
env vars set (see "Every integration boots gracefully" in the README). CI
passing is necessary but not sufficient for a real deploy: it does not touch
a database, so it cannot catch a bad migration or a misconfigured
integration. Use this checklist for that.

## Cold-start checklist (new environment)

Work through these in order — each later step assumes the previous ones are
done.

1. **Neon Postgres** — create a project at https://console.neon.tech, copy
   the pooled connection string (`sslmode=require`) into `DATABASE_URL`.
2. **Upstash Redis** — create a database at https://console.upstash.com,
   copy the REST URL/token into `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN`. Required for rate limits and alert cooldowns
   in production (see [`src/lib/redis`](../src/lib/redis)).
3. **Clerk application** — create an application at
   https://dashboard.clerk.com.
   - Enable **Organizations** under Configure → Organizations — it is
     opt-in per Clerk application, and this app's tenancy model is built on
     it (`organizations.id` in our schema is the Clerk organization id).
   - Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY`.
   - Set the sign-in/up and redirect URLs to match `.env.example`
     (`/sign-in`, `/sign-up`, `/dashboard`).
   - The first authenticated request for a Clerk organization lazily
     creates its row in our `organizations` table (`getOrgContext` in
     `src/lib/auth/tenancy.ts`) — it fetches the org's name from Clerk's
     backend API and upserts it, so no manual seeding is required for a
     real tenant. If the Clerk API call fails transiently, the row is
     still created (name falls back to the org slug/id) rather than
     blocking sign-in.
4. **Inngest Cloud** — create an app at https://app.inngest.com, copy
   `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
5. **Set env vars in Vercel** — Project Settings → Environment Variables,
   filled in per the `development` / `preview` / `production` groups.
   Use [`.env.example`](../.env.example) as the source of truth for every
   key the app reads; everything is optional at boot, but production should
   have at minimum Clerk, Neon, and Upstash configured. Sentry, LangSmith,
   the AI provider keys, and notification delivery keys are additive.
6. **Run the initial migration** (see "Migrations" below) against the new
   `DATABASE_URL` before the first deploy that expects the schema to exist.
7. **Deploy to Vercel** — connect the repository, set the production branch
   to `main`. Preview deployments build on every PR (same build CI already
   validated) but must not run migrations automatically — see below.
8. **Sync Inngest Cloud** — after the first production deploy, open the
   Inngest dashboard for this app and trigger **Sync now**, pointing at
   `https://<your-domain>/api/inngest` (the route Inngest's SDK exposes via
   `serve()` in [`src/app/api/inngest/route.ts`](../src/app/api/inngest/route.ts)).
   Without this sync, Inngest Cloud has no functions registered and
   scheduled/event-triggered jobs (ingestion, scoring, alerts, briefs) will
   not run in production. Re-sync after any deploy that adds, removes, or
   renames an Inngest function.
9. **Smoke test** — visit the deployed URL: the landing page should render
   with zero configuration; sign-up should reach Clerk; `/dashboard` should
   redirect to sign-in when signed out and render the shell when signed in.

## Migrations (release step)

Migrations are **never** run automatically on preview or production
deploys — they are a deliberate, separate release step, run once per schema
change:

```bash
# From a machine/CI job with production DATABASE_URL in scope:
npm run db:migrate   # drizzle-kit migrate — applies drizzle/*.sql in order
```

`npm run db:generate` (offline, no `DATABASE_URL` needed) produces the SQL
files under `drizzle/` from `src/lib/db/schema.ts`; review the generated SQL
before committing it, then run `db:migrate` against production as its own
step, before or immediately after deploying the code that depends on the new
schema (additive changes — new nullable columns, new tables — are safe to
apply before the code deploy; anything that removes or renames a column
needs the code deploy first so nothing still reads the old shape).

## Rollback

**App code:** Vercel keeps every deployment immutable — roll back
instantly by promoting a previous deployment from the Vercel dashboard
(Deployments → select a prior one → Promote to Production). No rebuild
required.

**Schema migrations:** this project does not maintain hand-written "down"
migrations (`drizzle-kit generate` only emits forward SQL). The rollback
path is a **Neon branch restore**, not a reverse migration:

1. Before running a migration you're not 100% sure about in production,
   create a Neon branch first (Neon dashboard → Branches → New Branch from
   `main` at the current timestamp, or `neon branches create` via the Neon
   CLI/API) as an explicit checkpoint you can restore from.
2. If a migration causes a problem, use Neon's point-in-time restore
   (dashboard → Branches → Restore, or the branch you checkpointed in step
   1) to bring the `main` branch back to the pre-migration state. Neon
   retains point-in-time recovery history even without an explicit manual
   checkpoint (window depends on your Neon plan) — the manual branch in
   step 1 just makes the restore point unambiguous and immediate.
3. After restoring the database, also roll back the app deployment (see
   above) if the code deploy assumed the new schema — restore both halves
   together, not just one.

## Clerk organization setup (reference)

Organizations must be turned on per-application in Clerk (Configure →
Organizations → Enable). Once enabled, users can create or be invited to an
organization from Clerk's own UI (`<OrganizationSwitcher />` /
`<CreateOrganization />` components, or the Clerk-hosted account portal).
This app reads the active organization from the Clerk session
(`auth().orgId`) — see the "Known gap" note in step 3 above for what that
does and doesn't wire up on our side today.
