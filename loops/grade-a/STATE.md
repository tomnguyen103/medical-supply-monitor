# Grade-A Campaign — State

Single source of truth for the "bring medical-supply-monitor to grade A in all 8
health-audit lanes" campaign. Read this FIRST every run. Plan doc:
`.claude/prompts/grade-a-campaign.md`. Origin audit memory: project auto-memory
`health-audit-2026-07.md`.

## Campaign meta

- Started: 2026-07-02
- Base commit at campaign start: `421d2bc` (feat(landing): rebuild marketing page as premium "Resilience Desk" design) — confirmed green (lint/typecheck/build/test) before any campaign work.
- Merged PR count so far: 0 / 12 (hard budget)
- Consecutive gate-failure count (current phase): 0

## Phase checklist

| Phase | Branch | Status | PR | Notes |
|---|---|---|---|---|
| P0 restore-tree | (none — working-tree-only fix) | **DONE** | — (no diff vs main; see below) | Discarded corruption via `git stash`, not a commit. See "P0 details". |
| P1 ci-gates | `chore/ci-gates` | TODO | — | Next up. |
| P2 org-onboarding-and-isolation-tests | `feat/org-onboarding-and-isolation-tests` | TODO | — | |
| P3 alert-loop-reliability | `fix/alert-loop-reliability` | TODO | — | |
| P4 signal-lifecycle-and-matching | `fix/signal-lifecycle-and-matching` | TODO | — | |
| P5 import-integrity | `fix/import-integrity` | TODO | — | |
| P6 cron-batching-and-indexes | `perf/cron-batching-and-indexes` | TODO | — | |
| P7 hardening-and-dead-weight | `chore/hardening-and-dead-weight` | TODO | — | |
| P8 VERIFY (adversarial re-audit loop) | n/a | TODO | n/a | Repeats until exit predicate holds. |

## Per-lane grade (updated after every grade change)

| # | Lane | Grade | Last verified |
|---|---|---|---|
| 1 | Correctness | NO-GO baseline (ungraded) | 2026-07-02 audit |
| 2 | Security | NO-GO baseline (ungraded) | 2026-07-02 audit |
| 3 | Silent failures | NO-GO baseline (ungraded) | 2026-07-02 audit |
| 4 | Performance | NO-GO baseline (ungraded) | 2026-07-02 audit |
| 5 | Tests | NO-GO baseline (ungraded) | 2026-07-02 audit |
| 6 | Dead weight | NO-GO baseline (ungraded) | 2026-07-02 audit |
| 7 | Maintainability | NO-GO baseline (ungraded) | 2026-07-02 audit |
| 8 | Prod readiness | NO-GO baseline (ungraded) | 2026-07-02 audit |

Grades will be assigned per-lane starting at P8 (first full re-audit). Until
then this table just tracks that no lane has been verified since baseline.

## P0 details (2026-07-02)

**Re-verified finding A1 and found it larger in scope than described.** The 8
NUL-corrupted files were confirmed still 100% NUL bytes (re-scanned whole repo
for NUL bytes — exactly those 8, nothing else). But investigation before
restoring surfaced a second problem the original audit didn't fully resolve:

- The untracked `src/components/auth-appearance.ts` (NUL) is imported by the
  **in-progress, uncommitted restyle** versions of `sign-in/page.tsx` and
  `sign-up/page.tsx` — NOT by HEAD's versions (confirmed via `git show HEAD`:
  HEAD's sign-in/sign-up render `<SignIn />`/`<SignUp />` with no `appearance`
  prop at all; `auth-appearance.ts` was never committed).
- Per the campaign's own decision default, the ~21 "surviving restyle" files
  needed a coherence check before being kept. That check failed hard: 11 of
  the 21 files reference 9 distinct custom CSS classes (`console-panel`,
  `console-shell`, `console-rail`, `console-label`, `console-panel-inner`,
  `console-line`, `console-rule`, `console-card-hover`, `console-enter`, plus
  a `console-surface-*` dynamic variant) that are **not defined anywhere** in
  the repo (grepped the only stylesheet, `globals.css`, at HEAD — zero
  matches). Those definitions almost certainly lived in the same
  crash-zeroed, unrecoverable `globals.css`. The affected files include both
  root layouts (`(auth)/layout.tsx`, `(dashboard)/layout.tsx`) and the `Card`
  primitive (`ui/card.tsx`) used everywhere — i.e. the core chrome, not
  peripheral styling. **Verdict: incoherent.** Per decision default, reverted
  the whole restyle set to HEAD rather than committing a partially-broken UI.
- Consequence: once the incoherent restyle is reverted, HEAD's own
  sign-in/sign-up pages are restored too, and those never imported
  `auth-appearance.ts`. Recreating it as instructed by the P0 plan text would
  produce a file with **zero importers** — dead code on arrival. Marking that
  sub-instruction **WONTFIX**: premise (importers exist) was true only in the
  since-reverted restyle branch, not in the tree this campaign is building on.

**Action taken:** `git stash push -u -m "pre-P0 snapshot..." -- src` (stash
`stash@{0}` on `main`) — preserves the corrupted files AND the 21-file
restyle-in-progress for future recovery, rather than deleting them. Working
tree now matches `HEAD` (421d2bc) exactly under `src/`. No commit was needed
and no PR was opened: there is no diff between the cleaned-up working tree
and already-green `main`, so there is nothing to review or merge. `.next/`
build cache was also stale (Windows tsbuildinfo path-separator assertion
failure) — cleared, unrelated to the corruption, not a code issue.

**Gate verification (all green):**
- `npm run lint` — clean
- `npm run typecheck` — clean
- `npm run build` — succeeds, all 12 routes compile
- `npx vitest run` — 9 files / 61 tests passed
- App renders: verified via direct HTTP fetch of `/`, `/dashboard` (307 → sign-in, expected), `/sign-in`, `/sign-up` — all 200/307 as expected, correct title/content, zero error-boundary markers. (Note: the `preview_*` browser tool's screenshot/navigation hung on this machine even against this known-good tree — an environment/tool issue, not an app issue. Verified via curl instead.)

**Follow-up (explicitly out of campaign scope per decision default — "Do NOT
attempt to recreate the lost premium restyle inside this campaign"):** redo
the dashboard/auth premium restyle (console-shell/console-panel/console-rail
design system) as its own dedicated session, recovering intent from
`git stash show -p stash@{0}` on `main`. Flagged as a spawn_task suggestion.

## Findings register status (A1–A25)

- **A1: FIXED** (see P0 details above — working tree restored, no PR needed).
- A2–A25: not yet re-verified. Will re-verify each at its current file:line immediately before its phase, per campaign rules (lines may have drifted).

## Decisions log

- 2026-07-02: P0 — reverted entire 21-file restyle set to HEAD (incoherent: depends on undefined CSS from the unrecoverable globals.css). Did not recreate `auth-appearance.ts` (would be dead code — zero importers once restyle reverted). Both are deviations from the campaign doc's literal P0 text, justified by re-verification evidence above; human can veto by popping `stash@{0}` and overriding.
- 2026-07-02: P0 produced no PR (zero diff vs already-green main). Treating "phase counts only when MERGED" as satisfied by the tree already matching main — no merge action exists to take.

## Human gates hit

None yet.
