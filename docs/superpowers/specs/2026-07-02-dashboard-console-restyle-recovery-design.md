# Dashboard/Auth "Console" Restyle — Recovery Design

Status: Approved. Date: 2026-07-02.

## Context

A crash NUL-corrupted 8 working-tree files during an in-progress premium
restyle of the dashboard + auth UI, including `src/app/globals.css`. The
2026-07-02 health audit reverted the whole 21-file restyle-in-progress to
`HEAD` rather than commit an incoherent UI (see project memory
`health-audit-2026-07`), but preserved everything in
`git stash@{0}` ("pre-P0 snapshot...") on `main` for recovery. This doc
specs that recovery, done as its own dedicated piece of work per
`loops/grade-a/STATE.md`'s explicit note that the campaign deliberately
left this out of scope.

Of the 28 files touched in the stash, 21 have clean, fully-readable text
diffs (`git stash show -p stash@{0}`) — only 7 got NUL-corrupted *in the
stash itself* (they were already corrupted before the stash was created).
Those 21 files reference 9 custom `console-*` CSS classes/tokens that were
never committed anywhere; their definitions lived only in the
crash-zeroed `globals.css`.

**Key finding that drives this whole design:** the marketing homepage
(shipped in `421d2bc`, "Resilience Desk") already has an equivalent,
currently-live pattern: `.bezel`/`.bezel-inner` (double-radius panel —
"a porcelain panel seated in a machined tray"), `.eyebrow` (mono tracked
kicker label), `.calib-rule` (hairline tick divider). `risk-preview.tsx`
uses `.bezel`/`.bezel-inner` today and its own comment calls it "the
signature element." The stashed `console-*` classes are that same
pattern, ported from the marketing porcelain palette onto the app's
shadcn/teal tokens (`--card`, `--border`, `--primary`) so it works under
real light/dark mode. This is reconstruction from strong evidence, not
invention from scratch.

## Goal

Make the stashed 21-file restyle render correctly and extend it
coherently to the 4 files whose in-progress restyle content was itself
lost to corruption, so the dashboard + auth UI reach the same premium bar
as the already-shipped marketing page.

## Non-goals

- `src/app/page.tsx` (marketing homepage) and `src/components/risk-preview.tsx`
  — both corrupted in the stash, but both are already on the
  shipped "Resilience Desk" system and out of scope (dashboard/auth only,
  per the task). The stash shows only a trivial byte-level delta for
  each (a few words) — not a structural restyle. These two files are
  restored verbatim from `HEAD`, unchanged.
- No changes to data/business logic, routing, or anything outside
  visual chrome.
- Not part of, and not blocking, the grade-A health-audit campaign.

## Design system additions (`src/app/globals.css`)

All additive — nothing existing is removed or altered. Placed as a new
section, structurally parallel to the existing "Resilience Desk" section.
Concrete values below are a starting recipe; final shadow/opacity values
get tuned visually during implementation, not treated as pixel-locked by
this doc.

**New color tokens** (`:root`, then mapped in `@theme inline` exactly
like the existing `--color-paper` etc., so Tailwind generates
`bg-console-rail`, `border-console-line`, `bg-console-surface-2`
utilities automatically):

```css
--console-rail: var(--ink);                       /* reuse marketing's near-black petrol ink — intentional cross-system cohesion */
--console-line: oklch(0.52 0.085 184 / 0.35);      /* translucent teal — sits on the white active-nav pill, not the dark rail */
--console-surface-1: oklch(0.52 0.085 184 / 0.07);
--console-surface-2: oklch(0.52 0.085 184 / 0.14);
```

These are fixed (not redefined under the dark-mode media query): the
sidebar rail and its active-item pill are theme-invariant by design (the
stash hardcodes `bg-white` for the active pill regardless of OS theme) —
a permanently-dark instrument rail is the concept, independent of the
content area's light/dark mode.

**`.console-shell`** — applied to the outermost wrapper in both
`(auth)/layout.tsx` and `(dashboard)/layout.tsx`. Theme-aware subtle
top-down teal glow over `var(--background)`:

```css
.console-shell {
  position: relative;
  background:
    radial-gradient(1200px 640px at 50% -12%, color-mix(in oklch, var(--primary) 7%, transparent), transparent 70%),
    var(--background);
}
```

**`.console-panel` / `.console-panel-inner`** — the double-bezel, re-themed
onto app tokens. Deliberately does **not** set `border-radius` or
`padding` — every call site already supplies its own
`rounded-[...] p-1.5` etc. via Tailwind utilities, so the custom classes
only own background/border/shadow (properties no call site overrides):

```css
.console-panel {
  position: relative;
  border: 1px solid var(--border);
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--card) 100%, white 5%),
    color-mix(in oklch, var(--muted) 40%, var(--card) 60%)
  );
  box-shadow:
    inset 0 1px 0 color-mix(in oklch, white 35%, transparent),
    0 24px 48px -30px color-mix(in oklch, black 40%, transparent),
    0 8px 20px -14px color-mix(in oklch, black 25%, transparent);
}
.console-panel-inner {
  position: relative;
  background: var(--card);
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 1px color-mix(in oklch, white 22%, transparent);
}
```

Shadows use fixed black/white mix targets (not `var(--foreground)`, which
would invert to near-white in dark mode and read as a glow instead of a
shadow) — ambient shadows stay dark-toned in both themes; the inset
highlight stays light-toned in both themes (a "glass edge," a legitimate
convention in dark UI too).

**`.console-label`** — mono kicker label, the Geist/teal counterpart to
marketing's Plex-mono/brass `.eyebrow` (dashboard keeps Geist, not the
marketing serif/Plex stack — see root layout's own comment on this):

```css
.console-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--muted-foreground);
}
.console-label::before {
  content: "";
  width: 12px;
  height: 2px;
  border-radius: 1px;
  background: var(--primary);
  flex: none;
}
```

**`.console-rule`** — miniature calibration-tick divider for the sidebar
(narrower repeat than marketing's `.calib-rule`, no brass marker — brass
is marketing-only):

```css
.console-rule {
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    rgb(255 255 255 / 0.18) 0 1px,
    transparent 1px 12px
  );
}
```

**`.console-card-hover`** — hover lift on `StatTile`, gated behind both
`prefers-reduced-motion` and `(hover: hover)` (no sticky-hover on touch —
relevant since this ships to mobile):

```css
@media (prefers-reduced-motion: no-preference) and (hover: hover) {
  .console-card-hover {
    transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), border-color 0.35s ease, box-shadow 0.35s ease;
  }
  .console-card-hover:hover {
    transform: translateY(-2px);
    border-color: color-mix(in oklch, var(--primary) 35%, var(--border));
    box-shadow:
      inset 0 1px 0 color-mix(in oklch, white 35%, transparent),
      0 30px 60px -28px color-mix(in oklch, black 45%, transparent),
      0 10px 24px -12px color-mix(in oklch, black 28%, transparent);
  }
}
```

**`.console-enter`** — page-content entrance, reuses the existing
`msm-rise` keyframes already in the file (no duplicate animation):

```css
@media (prefers-reduced-motion: no-preference) {
  .console-enter {
    animation: msm-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
}
```

## File plan

**21 files with clean stash diffs — apply as-is.** They already reference
the classes above correctly: both group layouts, `sign-in`/`sign-up`
pages, `auth-not-configured.tsx`, `brand.tsx`, `alert-events-table.tsx`,
`alert-rules-panel.tsx`, `data-table.tsx`, `demo-workspace-panel.tsx`,
`primitives.tsx`, `setup-checklist.tsx`, `sidebar.tsx`,
`signals-table.tsx`, `topbar.tsx`, `severity-badge.tsx`, and
`ui/{badge,button,card,input,table}.tsx`.

**4 corrupted files rebuilt by hand against `HEAD`**, matching the idiom
from the 21 readable files:

- `src/app/layout.tsx` (root) — expect near-identical to `HEAD`; the
  console-shell/glow work lives in the group layouts, not here. Confirm
  nothing else needs touching once the rest renders.
- `src/app/(dashboard)/dashboard/page.tsx` — restyle the two inline blocks
  (no-DB-connected banner, "what comes next" card) onto the
  `console-panel`/`console-panel-inner` + `console-label` idiom.
  `PageHeader`/`StatTile` usage is unchanged — they inherit the new look
  automatically since `primitives.tsx` is one of the 21 clean files.
- `src/app/(dashboard)/dashboard/alerts/page.tsx` — restyle the inline
  "Event history" header block the same way.
- `src/components/dashboard/import-panel.tsx` — rebuild using
  `demo-workspace-panel.tsx`'s exact structure (panel wrap, `console-label`
  header, restyled status-feedback box matching the rounded-2xl
  border-box pattern used elsewhere for callouts).

**2 corrupted files restored verbatim, untouched:** `src/app/page.tsx`,
`src/components/risk-preview.tsx` (see Non-goals).

**New file — `src/components/auth-appearance.ts`:** a Clerk `Appearance`
object (API confirmed against current Clerk docs: `variables` / `elements`
/ `cssLayerName`). Built as `rootBox` (`console-panel`) + `card`
(`console-panel-inner`) — the same two-layer construction as every other
panel in the app — with `variables` pointing at `var(--primary)` etc. so
it follows light/dark mode automatically, and `cssLayerName` set so
Tailwind utility overrides in `elements` reliably win against Clerk's
injected styles under Tailwind v4's cascade layers. Starting element set:
`rootBox`, `card`, `headerTitle`, `headerSubtitle`, `socialButtonsBlockButton`,
`dividerLine`, `dividerText`, `formFieldLabel`, `formFieldInput`
(mirrors `ui/input.tsx`), `formButtonPrimary` (mirrors `ui/button.tsx`),
`footerActionLink`. Clerk **is** configured in this dev environment
(`.env.local` has publishable + secret keys), so `/sign-in` and
`/sign-up` render the real Clerk UI, not the `AuthNotConfigured`
fallback — this can be verified live, not just type/lint/build-checked.

## Verification plan

1. `npm run lint`, `npm run typecheck`, `npm run build` — must stay green
   (matches the campaign's own gate bar).
2. Browser check via preview tools, desktop **and** mobile viewport,
   light **and** dark (`prefers-color-scheme`):
   - Dashboard overview (`/dashboard`) — stat tiles incl. hover, setup
     checklist, demo workspace panel / next-steps card.
   - Alerts (`/dashboard/alerts`) — rules panel, event history table,
     evidence drawer.
   - Sign-in / sign-up — real Clerk-rendered card, both light and dark.
   - Sidebar — active vs. inactive nav item states, mobile topbar nav.
3. No console errors, no layout shift/overflow at mobile width.
