# GOAL: Bring medical-supply-monitor to grade A in all 8 health-audit lanes

Bring this repo to grade A in all 8 health-audit lanes — correctness, security, silent failures, performance, tests, dead weight, maintainability, production readiness — with the grade proven by a fresh adversarial re-audit, then stop.

## EXIT PREDICATE (all four must hold — this is the only "done")

1. On main: `npm run lint`, `npm run typecheck`, `npx vitest run` (3× consecutive, identical results), `npm run build` all pass.
2. A fresh 8-lane adversarial re-audit (parallel subagents; evidence rules: every finding = file:line + concrete failure scenario, verify mitigations before flagging) reports ZERO Critical or High findings in any lane.
3. Every lane's A-checklist (below) is fully ticked with evidence.
4. All campaign PRs are MERGED (open ≠ done) and main is green afterward.

When all four hold: write the final grade card to `loops/grade-a/GRADE.md`, update STATE, report, stop.

## STATE (read FIRST, every run)

`loops/grade-a/STATE.md` — create on first run with: phase checklist, per-lane grade, PR links, decisions log, findings marked FIXED / SKIPPED(already fixed) / WONTFIX(reason). Update after every merge and every grade change. You cold-start with no memory of prior runs; this file is the single source of truth for campaign progress. Also read the project auto-memory `health-audit-2026-07.md` if present.

## CONTEXT

Full audit delivered 2026-07-02 against HEAD `421d2bc` + a dirty working tree. HEAD was green (lint 6s / typecheck 4s / build 19s / tests 61/61); the working tree was unbuildable (8 NUL-zeroed files). RE-VERIFY every finding at its file:line before acting — lines drift and some findings may already be fixed; mark those SKIPPED in STATE and move on.

## NON-NEGOTIABLE RULES

- Follow the global Git & PR workflow: branch off fresh main → draft PR (iterate free) → self-review to green → mark ready ONCE → CodeRabbit fix rounds → squash-merge. A phase counts only when MERGED. Never push red. If CodeRabbit is throttled, pause per global rules.
- Preserve the intentional graceful-degradation unconfigured-boot design in dev. Add fail-closed behavior ONLY behind production checks (`env.app.isProduction` / `NODE_ENV === "production"`).
- Every behavioral fix ships with a test that fails before and passes after. Surgical diffs; nothing outside the phase's scope.
- Any scoring change bumps `SCORING_VERSION` and updates fixtures deliberately.
- HUMAN GATES — stop and ask instead of acting: destructive/irreversible operations (data-deleting migrations, force-push, history rewrite), branch protection blocking a merge, anything needing new paid infrastructure, and anomalies the verifier can't classify.
- If re-verification shows a finding is wrong or obsolete: record WONTFIX + one-line reason in STATE. Never force a fix to satisfy the list.

## HARD BUDGET (stop and report even if the goal isn't met)

More than 12 merged PRs, OR any phase failing its gates 3 consecutive attempts, OR any single run burning >2h wall time without a merged PR or grade change.

## DECISION DEFAULTS (use these; list each used default under "Decisions" in the PR body so a human can veto at review)

- Scoring monotonicity (A20): strongest domain contribution at full weight, additional domains ×0.3 with diminishing returns, keep the 65 cap; bump SCORING_VERSION.
- Country-only match (A9): requires region/keyword corroboration, else no match.
- Per-org delivery targets (A6): nullable `slack_webhook_url` + `alert_email` on organizations (or an org_settings table); env fallback allowed only in non-production.
- Org onboarding (A2): lazy upsert of the organizations row inside `getOrgContext` on first authenticated hit; Clerk `organization.created` webhook optional later.
- Import dedupe (A17): pre-select existing rows by `lower(name)` within the org; skip and report counts.
- Surviving restyle files (~21 intact uncommitted UI files): if the tree builds and renders coherently after Phase 0, commit them as their own PR; if incoherent, revert the whole restyle set to HEAD and log the redo as follow-up. Do NOT attempt to recreate the lost premium restyle inside this campaign.

## PHASES (one PR each unless noted; check STATE and skip completed work)

- **P0 `fix/restore-tree` — A1.** 8 files were 100% NUL bytes (crash zeroing): src/app/{page,layout}.tsx, src/app/globals.css, dashboard/page.tsx, dashboard/alerts/page.tsx, import-panel.tsx, risk-preview.tsx (restore all 7 tracked from HEAD via `git restore --source=HEAD --`), plus UNTRACKED src/components/auth-appearance.ts — unrecoverable; recreate it from how its two importers use it (sign-in/sign-up pages, a Clerk appearance object). Gate: lint+typecheck+build green, app renders.
- **P1 `chore/ci-gates` — A3.** GitHub Actions on PR + main: lint, typecheck, vitest, build. Document the migration release step (`drizzle-kit migrate`) and rollback (Neon branch restore) in docs/DEPLOYMENT.md (cold-start deploy checklist: env, migrations, Inngest Cloud sync, Clerk org setup). Fix the false "enforced in CI" comment in next.config.ts. Done EARLY so every later PR is gated.
- **P2 `feat/org-onboarding-and-isolation-tests` — A2 + A10.** Lazy org upsert (default above). Add a DB-backed test harness (pglite or testcontainers-postgres) and two-org isolation integration tests over listAlertEvents, listAlertRules, listRiskSignals, and the engine's latest-snapshot query. Delete the dead tenant-isolation.ts helpers their current tests exercise.
- **P3 `fix/alert-loop-reliability` — A4, A6, A7, A8, A19.** Gate downstream steps on total/threshold connector failure, not any-single-row (pipeline.ts:104, functions.ts:27). Per-org try/catch + cooldown catch (engine.ts:86-95, 691). Delivery: per-org targets, 10s AbortController timeouts, reserve cooldown only after `sent`, redelivery path for `failed` (delivery.ts, engine.ts:415-463). Inngest Sentry middleware + captureException at every swallow site + connector last-success surfaced (pipeline.ts:185, graph.ts:249). Typed results for all alert actions (actions/alerts.ts — copy the ImportOutcome pattern).
- **P4 `fix/signal-lifecycle-and-matching` — A5, A9, A20, A21, A23.** Reconciliation marks org signals absent from the latest fetch resolved; stable dedupe key without status/update_date (persistence.ts:93, openfda-drug-shortages.ts:98). Country corroboration (matching.ts:103-116). Monotonic scoring (scoring.ts:210-231). Min-4-char + token-boundary item-name matching (matching.ts:172-181). 30d inventory freshness window (snapshots.ts:261-266).
- **P5 `fix/import-integrity` — A17, A18, A22.** Name-based re-import dedupe (import.ts:112-119, 199-203, 244-248 — NULL keys bypass unique indexes). `db.batch` items+identifiers and report skipped identifiers (import.ts:151-156). Strict thousands-grouping number coercion, reject else (coerce.ts:18 — "2,5"→25, "1.000"→1 today).
- **P6 `perf/cron-batching-and-indexes` — A11–A14.** Chunked multi-row upserts replacing per-row writes (snapshots.ts:93-176, persistence.ts:25-71, engine.ts:290-470); Redis MGET for cooldowns. DISTINCT ON latest-per-item instead of full-history loads (snapshots.ts:231-258). Load each tenant catalog once per run, not per connector (pipeline.ts:70-101). Migration adding (org,last_fetched_at) + (org,status) on risk_signals and (org,created_at) on alert_events. Parallelize connector fetches with allSettled. Document napkin math for 100 tenants staying under step limits.
- **P7 `chore/hardening-and-dead-weight` — A15, A16, A24, A25 + below-cut sweep.** Prod fail-closed rate limiting (redis/index.ts:53-59); prod loud-fail when Clerk unconfigured (proxy.ts:18-23); prod assert INNGEST_SIGNING_KEY / never isDev; security headers (HSTS, frame-ancestors 'none', nosniff, Referrer-Policy, baseline CSP) in next.config.ts. Extract the duplicated latest-snapshot query (graph.ts:667-711 = engine.ts:329-370); derive domain/severity/import enum lists from schema enumValues (or pin with an equality test). Deletions: `langchain`, `recharts`, `tsx`, src/components/ui/separator.tsx, dead requireOrgContext/requireOrgPermission in tenancy.ts, PostHog block in .env.example. Declare `server-only` explicitly; document GOOGLE_API_KEY; remove or wire the dead INNGEST_EVENT_KEY trigger; Gemini key via header not URL; fixed timeZone in table date formatting; re-run knip/depcheck and resolve or annotate every hit. Anything consciously not fixed goes in docs/ACCEPTED_RISKS.md with a reason.
- **P8 VERIFY (the loop).** Re-run the full 8-lane adversarial audit with parallel subagents (same lanes, same evidence rules, no style nits). Grade each lane against the A-checklists. Anything below A → targeted fix PR(s) → repeat P8. The grader must be adversarial: fresh subagents auditing code, not a checklist self-attestation.

## LANE A-CHECKLISTS (grade A means ALL ticked, verified)

1. **Correctness:** A5, A9, A17, A20, A21, A22, A23 fixed, each with a red→green test; re-audit finds zero Critical/High correctness issues.
2. **Security:** A15, A16, A25 + Inngest prod signing assert done; `npm audit` zero high/critical; re-audit finds zero Medium+ except documented entries in ACCEPTED_RISKS.md.
3. **Silent failures:** A4, A7, A8, A18 fixed; grep gate passes: no bare `catch {}` or counter-only catch on pipeline/engine/delivery/import paths; every outbound fetch has a timeout; a deliberately-thrown test error inside an Inngest function reaches Sentry in dev.
4. **Performance:** A11–A14 merged; no per-row awaited DB write inside a loop remains on the cron path; the 3 composite indexes exist in a migration; 100-tenant napkin math documented.
5. **Tests:** the 9 audit-named tests exist and pass (two-org isolation; delivery outcome mapping incl. cooldown-not-burned-on-failure; import idempotency; identifier-conflict reporting; engine dedupe/cooldown/approval sequence; signal lifecycle reconcile; matching negatives; scoring monotonicity property; retention evidence guard); DB-backed harness in place; suite green 3× consecutively.
6. **Dead weight:** langchain/recharts/tsx removed; separator.tsx + dead tenancy exports deleted; `server-only` declared; knip/depcheck clean or annotated; `.env.example` exactly matches actual env reads.
7. **Maintainability:** shared latest-snapshot query extracted; enum lists derived from schema (or equality-test-pinned); graph.ts split into graph/runs/trace/import-mapping (or acceptance recorded with reason); README + docs claims verified true against the code.
8. **Prod readiness:** real-org onboarding proven by an integration test or documented walkthrough; CI green and gating; DEPLOYMENT.md enables a cold-start deploy; prod boot asserts (Clerk, Redis-for-writes, Inngest signing); alert actions return typed results.

## FINDINGS REGISTER (audit 2026-07-02 — re-verify each before fixing)

A1 8 NUL-zeroed files (7 tracked + untracked auth-appearance.ts) · A2 demo/workspace.ts:216 only org insert, no real onboarding · A3 no CI/.github, no migration step, no rollback docs · A4 pipeline.ts:104 + functions.ts:27 single failure cancels all tenants' alerts (memoized) · A5 persistence.ts:93 signals never resolve + volatile dedupe key · A6 delivery.ts global recipients, no timeout, no retry, cooldown pre-delivery · A7 engine.ts:86-95,691 per-org loop + redis.set uncaught · A8 no Sentry in jobs, bare catch counters · A9 matching.ts:103-116 bare country fallback → arbitrary supplier · A10 isolation tests exercise dead code · A11 row-at-a-time cron writes (snapshots/persistence/engine) · A12 snapshots.ts:248 full-history loads · A13 pipeline.ts:70 catalog fetched 10× · A14 missing composite indexes · A15 rate limit fails open unconfigured · A16 proxy.ts:18 Clerk fail-open silent · A17 NULL-key re-imports duplicate catalog · A18 import.ts:151 identifier conflicts silently dropped · A19 alert actions return void on guard failure · A20 scoring.ts:210 non-monotonic averaging · A21 matching.ts:172 no min item-name length · A22 coerce.ts:18 comma stripping · A23 snapshots.ts:261 stale inventory forever · A24 duplicated snapshot query + hand-copied enums ×3/×5 · A25 no security headers.
