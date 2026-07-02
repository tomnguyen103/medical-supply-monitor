# Dashboard/Auth Console Restyle Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover the stashed premium "console" restyle of the dashboard + auth UI (lost to NUL corruption, preserved in `git stash@{0}`) into a coherent, working state by defining the missing `console-*` CSS system and hand-rebuilding the 4 files whose own restyle content was itself corrupted.

**Architecture:** Additive CSS-only design-token/component-class layer in `src/app/globals.css` (mirrors the already-shipped marketing `.bezel`/`.eyebrow` pattern, re-themed onto the app's shadcn tokens), consumed by 21 files restored verbatim from the stash plus 4 files hand-rebuilt to match that same idiom, plus one new Clerk theming file.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (CSS-first `@theme`), shadcn/ui primitives, Clerk `@clerk/nextjs@7.5.9`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-02-dashboard-console-restyle-recovery-design.md`. Every task's requirements implicitly include that doc.
- `npm run lint`, `npm run typecheck`, `npm run build` must stay green after every task (matches the project's own gate bar per `loops/grade-a/STATE.md`).
- `.npmrc` already sets `legacy-peer-deps=true` — plain `npm install` works.
- Do not modify `src/app/page.tsx` or `src/components/risk-preview.tsx` — out of scope (see spec Non-goals). Do not modify anything outside visual chrome (no data/routing/business-logic changes).
- The 21 files in Task 3 must be applied byte-for-byte from `stash@{0}` — do not hand-retype them.
- All new/modified CSS lives in `src/app/globals.css`, additive only — never remove or alter existing rules.
- This branch (`claude/goofy-khayyam-a57d90`) is a worktree isolated from the main checkout, which currently has unrelated in-progress work (grade-A campaign P2, `feat/org-onboarding-and-isolation-tests`) — never run git commands with a `cd` into `C:\Users\huuth\Desktop\medical-supply-monitor` (the main checkout); stay in this worktree.

---

### Task 1: Add the console-* design token system to globals.css

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: CSS custom properties `--console-rail`, `--console-line`, `--console-surface-1`, `--console-surface-2` (and their `--color-console-*` Tailwind-utility mappings: `bg-console-rail`, `border-console-line`, `bg-console-surface-1`, `bg-console-surface-2`, etc.); CSS classes `.console-shell`, `.console-panel`, `.console-panel-inner`, `.console-label`, `.console-rule`, `.console-card-hover`, `.console-enter`.

- [ ] **Step 1: Add the new color tokens to `:root`**

Find this exact line (currently line 41):

```css
  --ring: oklch(0.52 0.085 184);
```

Insert immediately after it (before the `/*` marketing-surface comment block):

```css

  /* Command Console — dashboard/app instrument-rail tokens. */
  --console-rail: var(--ink);
  --console-line: oklch(0.52 0.085 184 / 0.35);
  --console-surface-1: oklch(0.52 0.085 184 / 0.07);
  --console-surface-2: oklch(0.52 0.085 184 / 0.14);
```

- [ ] **Step 2: Map the new tokens in `@theme inline` so Tailwind generates utilities**

Find this exact line (currently line 113):

```css
  --color-ring: var(--ring);
```

Insert immediately after it (before the `/* Marketing-surface palette */` comment):

```css

  --color-console-rail: var(--console-rail);
  --color-console-line: var(--console-line);
  --color-console-surface-1: var(--console-surface-1);
  --color-console-surface-2: var(--console-surface-2);
```

- [ ] **Step 3: Append the Command Console component-class section at end of file**

Find the last 4 lines of the file (the closing of `.stagger[data-visible] > *:nth-child(6)` and its enclosing `@media` block):

```css
  .stagger[data-visible] > *:nth-child(6) {
    transition-delay: 0.35s;
  }
}
```

Append this new section immediately after (i.e. at true end of file):

```css

/* ========================================================================
 * The Command Console — dashboard/app surface system
 * The same double-bezel/eyebrow/calibration-rule language as "The
 * Resilience Desk" above, re-themed onto the app's shadcn/teal tokens
 * (--card/--border/--primary) instead of the marketing porcelain palette,
 * so it works under real light/dark mode. See risk-preview.tsx's
 * .bezel/.bezel-inner for the marketing-side sibling of this pattern.
 * ===================================================================== */

.console-shell {
  position: relative;
  background:
    radial-gradient(1200px 640px at 50% -12%, color-mix(in oklch, var(--primary) 7%, transparent), transparent 70%),
    var(--background);
}

/* Double-bezel: deliberately does NOT set border-radius or padding — every
 * call site supplies its own `rounded-[...] p-1.5` etc. via Tailwind
 * utilities, so these classes only own background/border/shadow. */
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

/* Eyebrow label — the Geist/teal counterpart to .eyebrow's Plex/brass. */
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

/* Miniature calibration-tick divider, sized for the sidebar rail. */
.console-rule {
  height: 1px;
  background: repeating-linear-gradient(
    90deg,
    rgb(255 255 255 / 0.18) 0 1px,
    transparent 1px 12px
  );
}

/* Hover lift for StatTile. No sticky-hover on touch; respects reduced motion. */
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

/* Page-content entrance — reuses the existing msm-rise keyframes above. */
@media (prefers-reduced-motion: no-preference) {
  .console-enter {
    animation: msm-rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
  }
}
```

- [ ] **Step 4: Verify the build accepts the new CSS**

Run: `npm run build`
Expected: Build succeeds (exit 0), all routes compile. Tailwind v4 fails the build on malformed CSS, so a green build here is the meaningful check (there is no dedicated CSS test runner in this project).

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(dashboard): add console-* design token system to globals.css"
```

---

### Task 2: Create the Clerk auth-appearance theme

**Files:**
- Create: `src/components/auth-appearance.ts`

**Interfaces:**
- Consumes: `console-panel`, `console-panel-inner` classes from Task 1.
- Produces: `authAppearance` (named export), typed as `ComponentProps<typeof SignIn>["appearance"]` — consumed by Task 3's `sign-in/page.tsx` and `sign-up/page.tsx` (both already `import { authAppearance } from "@/components/auth-appearance"` and pass it to `appearance={authAppearance}`).

Note on typing: `@clerk/nextjs@7.5.9` does not export a `SignInProps`/`Appearance` type by name (verified by grepping `node_modules/@clerk/nextjs/dist/types/index.d.ts` — it only exports the components themselves). Deriving the type via `ComponentProps<typeof SignIn>["appearance"]` is the robust approach: it doesn't depend on Clerk's internal type-export layout, which is itself an indirection (`ClerkAppearanceRegistry['theme']`, augmented by `@clerk/react`). This exact code was verified against the installed package with `npx tsc --noEmit` before being written into this plan — it compiles clean. Do **not** add a `cssLayerName` field: that belongs to the wider `Appearance<T>` type used at `ClerkProvider` (global) scope, not the per-component `Theme` type `<SignIn>`/`<SignUp>` expect — adding it is a type error (`TS2353`).

- [ ] **Step 1: Write the file**

```typescript
import type { ComponentProps } from "react";
import type { SignIn } from "@clerk/nextjs";

// Themes the Clerk sign-in/sign-up card to match the app's console-panel
// system. rootBox + card mirror the same two-layer bezel construction used
// by every other panel in the app (see globals.css's .console-panel /
// .console-panel-inner). Colors reference CSS custom properties so the
// card follows light/dark mode automatically.
export const authAppearance: ComponentProps<typeof SignIn>["appearance"] = {
  variables: {
    colorPrimary: "var(--primary)",
    colorBackground: "var(--card)",
    colorForeground: "var(--foreground)",
    colorInput: "var(--background)",
    colorBorder: "var(--border)",
    borderRadius: "1rem",
    fontFamily: "var(--font-sans)",
  },
  elements: {
    rootBox: "console-panel w-full rounded-[1.75rem] p-1.5",
    card: "console-panel-inner w-full rounded-[1.25rem] border-0 shadow-none p-6 sm:p-8",
    headerTitle: "text-xl font-semibold tracking-tight",
    headerSubtitle: "text-sm text-muted-foreground",
    socialButtonsBlockButton: "h-10 rounded-xl border border-input bg-background/80",
    dividerLine: "bg-border",
    dividerText: "text-xs uppercase tracking-[0.1em] text-muted-foreground",
    formFieldLabel: "text-sm font-medium",
    formFieldInput: "h-10 rounded-xl border border-input bg-background/80",
    formButtonPrimary: "h-10 rounded-full bg-primary hover:bg-primary/90 text-sm font-medium shadow-none",
    footerActionLink: "text-primary hover:text-primary/90",
    identityPreviewEditButton: "text-primary",
  },
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: No errors (exit 0). Nothing imports this file yet (Task 3 wires the imports), so this only confirms the object's own shape is valid against `SignIn`'s appearance prop — already confirmed via scratch-file verification during planning, this step re-confirms after transcription.

- [ ] **Step 3: Commit**

```bash
git add src/components/auth-appearance.ts
git commit -m "feat(auth): add Clerk console-panel theme for sign-in/sign-up"
```

---

### Task 3: Restore the 21 clean-diff files from the stash

**Files:**
- Modify (restored verbatim from `stash@{0}`): `src/app/(auth)/layout.tsx`, `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx`, `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx`, `src/app/(dashboard)/layout.tsx`, `src/components/auth-not-configured.tsx`, `src/components/brand.tsx`, `src/components/dashboard/alert-events-table.tsx`, `src/components/dashboard/alert-rules-panel.tsx`, `src/components/dashboard/data-table.tsx`, `src/components/dashboard/demo-workspace-panel.tsx`, `src/components/dashboard/primitives.tsx`, `src/components/dashboard/setup-checklist.tsx`, `src/components/dashboard/sidebar.tsx`, `src/components/dashboard/signals-table.tsx`, `src/components/dashboard/topbar.tsx`, `src/components/severity-badge.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/input.tsx`, `src/components/ui/table.tsx`

**Interfaces:**
- Consumes: `console-panel`, `console-panel-inner`, `console-label`, `console-rule`, `console-card-hover`, `console-enter`, `console-shell` (Task 1); `bg-console-rail`, `border-console-line`, `bg-console-surface-2` utilities (Task 1); `authAppearance` (Task 2).
- Produces: restyled `Card`/`Button`/`Badge`/`Input`/`Table` primitives and dashboard/auth components that Task 4–6's hand-rebuilt files consume (e.g. `PageHeader`, `StatTile`, `EmptyState` from `primitives.tsx`).

These 21 files already have clean, human-readable diffs in the stash (confirmed via `git stash show -p stash@{0}` during planning — only 7 of the 28 stashed files are NUL-corrupted, and none of these 21 are among them). Restore them directly from the stash's tree rather than hand-retyping, to guarantee byte-for-byte fidelity to the recovered design.

- [ ] **Step 1: Restore all 21 files from the stash in one operation**

Run:

```bash
git checkout 'stash@{0}' -- \
  "src/app/(auth)/layout.tsx" \
  "src/app/(auth)/sign-in/[[...sign-in]]/page.tsx" \
  "src/app/(auth)/sign-up/[[...sign-up]]/page.tsx" \
  "src/app/(dashboard)/layout.tsx" \
  "src/components/auth-not-configured.tsx" \
  "src/components/brand.tsx" \
  "src/components/dashboard/alert-events-table.tsx" \
  "src/components/dashboard/alert-rules-panel.tsx" \
  "src/components/dashboard/data-table.tsx" \
  "src/components/dashboard/demo-workspace-panel.tsx" \
  "src/components/dashboard/primitives.tsx" \
  "src/components/dashboard/setup-checklist.tsx" \
  "src/components/dashboard/sidebar.tsx" \
  "src/components/dashboard/signals-table.tsx" \
  "src/components/dashboard/topbar.tsx" \
  "src/components/severity-badge.tsx" \
  "src/components/ui/badge.tsx" \
  "src/components/ui/button.tsx" \
  "src/components/ui/card.tsx" \
  "src/components/ui/input.tsx" \
  "src/components/ui/table.tsx"
```

Expected: no output, exit 0. `git status --short` now shows exactly these 21 paths as modified (`M`) and staged.

**Important — stash index may have shifted:** if any other `git stash` operations happened in this repo since the design spec was written, `stash@{0}` may no longer be the "pre-P0 snapshot" entry. Before running the command above, run `git stash list` and confirm the entry whose message starts with `pre-P0 snapshot` is at index 0; if it's at a different index, substitute `stash@{N}` throughout this task.

- [ ] **Step 2: Verify lint, typecheck, and build are all green**

Run: `npm run lint`
Expected: no errors (matches baseline: "clean" per campaign state notes).

Run: `npm run typecheck`
Expected: no errors. This is the point where `authAppearance`'s consumers (`sign-in/page.tsx`, `sign-up/page.tsx`) get exercised for real.

Run: `npm run build`
Expected: succeeds, all routes compile.

- [ ] **Step 3: Confirm root layout.tsx needs no change**

`src/app/layout.tsx` (root) was also NUL-corrupted in the stash — it is the 4th file the design spec calls out for hand-rebuilding — but its job (fonts, `ClerkProvider`, body class) does not touch `console-shell`, which lives entirely in the two group layouts just restored in Step 1. Run:

```bash
git diff HEAD -- src/app/layout.tsx
```

Expected: no output (file unchanged by this task). Open `src/app/layout.tsx` and confirm `<body className="min-h-[100dvh] bg-background font-sans text-foreground antialiased">` still wraps `{children}` — the group layouts' `console-shell` div renders inside that body unaffected. No edit needed here; this step exists so the 4th corrupted file from the spec's file plan is explicitly verified, not silently skipped.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(dashboard): restore stashed premium console restyle (21 files)

Recovered from git stash@{0} (pre-P0 snapshot). These files' diffs were
fully readable — no reconstruction needed, applied byte-for-byte."
```

---

### Task 4: Rebuild the dashboard overview page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `console-panel`, `console-panel-inner`, `console-label` (Task 1); `PageHeader`, `StatTile` from `primitives.tsx`, `SetupChecklist`, `DemoWorkspacePanel` (all restyled by Task 3 — used here unchanged, they inherit the new look automatically).

This file was NUL-corrupted in the stash (its in-progress restyle content is unrecoverable). Rebuilt here against the current `HEAD` content, restyling the two inline blocks (the "no database connected" banner and the `NextSteps` fallback card) to match the idiom Task 3 already established elsewhere (`SetupChecklist`'s `console-panel`/`console-panel-inner` + `console-label` header pattern; the single-layer `rounded-2xl border bg-muted/NN` callout-box idiom used for smaller alerts elsewhere in the restyle, e.g. `auth-not-configured.tsx`'s code block).

- [ ] **Step 1: Replace the file contents**

```tsx
import { TriangleAlert } from "lucide-react";

import { DemoWorkspacePanel } from "@/components/dashboard/demo-workspace-panel";
import { PageHeader, StatTile } from "@/components/dashboard/primitives";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { getOrgContext, hasOrgPermission } from "@/lib/auth/tenancy";
import { integrations } from "@/lib/env";
import { getCatalogContext, getCatalogCounts } from "@/lib/catalog";
import { SCORING_VERSION } from "@/lib/risk/scoring";
import { DAILY_BRIEF_GRAPH } from "@/lib/ai/graph";

// Reads per-tenant catalog counts: always render per-request.
export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const NEXT_STEPS = [
  { phase: "MVP", text: "Configure Clerk and database, select an org, seed demo data" },
];

export default async function OverviewPage() {
  const ctx = await getCatalogContext();
  const counts = ctx.ready ? await getCatalogCounts(ctx.orgId) : null;
  const orgCtx = ctx.ready ? await getOrgContext() : null;
  const canManageCatalog =
    ctx.ready &&
    orgCtx !== null &&
    orgCtx.orgId === ctx.orgId &&
    hasOrgPermission(orgCtx, "manage_catalog");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Overview"
        description="Foundation, catalog imports, ingestion, scoring, alerts, AI workflow, and production hardening are live."
      />

      {!integrations.database && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/70 p-4">
          <TriangleAlert
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
          />
          <div className="text-sm">
            <p className="font-medium">No database connected yet</p>
            <p className="mt-0.5 text-muted-foreground">
              Set <code className="font-mono">DATABASE_URL</code> in{" "}
              <code className="font-mono">.env.local</code>, then run{" "}
              <code className="font-mono">npm run db:migrate</code>. The shell
              renders without it so you can explore the structure.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Monitored items"
          value={counts ? String(counts.items) : "0"}
          hint={counts ? `${counts.watched} on watchlist` : "Import a catalog to begin"}
        />
        <StatTile
          label="Suppliers"
          value={counts ? String(counts.suppliers) : "0"}
          hint="Supplier exposure"
        />
        <StatTile
          label="Facilities"
          value={counts ? String(counts.facilities) : "0"}
          hint="Sites you monitor"
        />
        <StatTile
          label="Scoring version"
          value={SCORING_VERSION}
          hint={`${DAILY_BRIEF_GRAPH.nodes.length}-node AI workflow`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SetupChecklist />
        {ctx.ready && canManageCatalog ? <DemoWorkspacePanel /> : <NextSteps />}
      </div>
    </div>
  );
}

function NextSteps() {
  return (
    <div className="console-panel rounded-[1.75rem] p-1.5">
      <div className="console-panel-inner overflow-hidden rounded-[1.25rem]">
        <div className="border-b border-border/80 bg-muted/20 px-5 py-4">
          <p className="console-label">Roadmap</p>
          <h2 className="mt-2 font-semibold tracking-tight">What comes next</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Phase 7 hardening is in. Configure an organization to run the demo.
          </p>
        </div>
        <ul className="divide-y divide-border/80">
          {NEXT_STEPS.map((step) => (
            <li key={step.phase} className="flex items-start gap-3 px-5 py-3.5">
              <span className="mt-0.5 font-mono text-xs text-primary">{step.phase}</span>
              <span className="text-sm text-muted-foreground">{step.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed, no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard/page.tsx"
git commit -m "feat(dashboard): rebuild overview page onto console-panel idiom"
```

---

### Task 5: Rebuild the alerts page

**Files:**
- Modify: `src/app/(dashboard)/dashboard/alerts/page.tsx`

**Interfaces:**
- Consumes: `console-label` (Task 1); `PageHeader`, `EmptyState` from `primitives.tsx`, `AlertRulesPanel`, `AlertEventsTable`, `CatalogBlocked` (restyled by Task 3, used unchanged).

Also NUL-corrupted in the stash. Rebuilt against current `HEAD`, restyling only the inline "Event history" header block (`AlertRulesPanel` and `AlertEventsTable` already carry their own restyled chrome from Task 3).

- [ ] **Step 1: Replace the file contents**

```tsx
import { Bell } from "lucide-react";

import { AlertEventsTable } from "@/components/dashboard/alert-events-table";
import { AlertRulesPanel } from "@/components/dashboard/alert-rules-panel";
import { CatalogBlocked } from "@/components/dashboard/catalog-blocked";
import { EmptyState, PageHeader } from "@/components/dashboard/primitives";
import { getCatalogContext } from "@/lib/catalog";
import { listAlertEvents, listAlertRules } from "@/lib/alerts/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const ctx = await getCatalogContext();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Alerts"
        description="Alert rules, daily briefs, approval gates, and delivery history with evidence."
      />
      {!ctx.ready ? (
        <CatalogBlocked reason={ctx.reason} />
      ) : (
        <AlertsContent organizationId={ctx.orgId} />
      )}
    </div>
  );
}

async function AlertsContent({ organizationId }: { organizationId: string }) {
  const [rules, events] = await Promise.all([
    listAlertRules(organizationId),
    listAlertEvents(organizationId, 100),
  ]);

  return (
    <div className="space-y-8">
      <AlertRulesPanel rules={rules} />
      {events.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No alert events yet"
          body="Create a rule or run evaluation after scoring snapshots exist. Critical alerts wait for human approval before delivery."
        />
      ) : (
        <section className="space-y-4">
          <div>
            <p className="console-label">Delivery history</p>
            <h2 className="mt-2 font-semibold tracking-tight">Event history</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Latest 100 events. Every alert and brief includes evidence, freshness, and confidence.
            </p>
          </div>
          <AlertEventsTable data={events} />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed, no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dashboard)/dashboard/alerts/page.tsx"
git commit -m "feat(dashboard): rebuild alerts page event-history header onto console-label idiom"
```

---

### Task 6: Rebuild the import panel component

**Files:**
- Modify: `src/components/dashboard/import-panel.tsx`

**Interfaces:**
- Consumes: `console-panel`, `console-panel-inner`, `console-label` (Task 1); `Button`, `Input` (restyled by Task 3).

Also NUL-corrupted in the stash. Rebuilt against current `HEAD`, restructured to match `demo-workspace-panel.tsx`'s exact pattern (panel wrap + `console-label` header, here with a trailing action button matching `alert-rules-panel.tsx`'s header-with-trailing-content layout), and the status-feedback box restyled to the `rounded-2xl border bg-muted/NN` callout idiom used elsewhere (e.g. `signals-table.tsx`'s change-summary box).

- [ ] **Step 1: Replace the file contents**

```tsx
"use client";

import { useActionState } from "react";
import { AlertTriangle, CheckCircle2, Download, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImportOutcome } from "@/lib/actions/import";

export function ImportPanel({
  action,
  entityLabel,
  template,
  templateFilename,
}: {
  action: (prev: ImportOutcome | null, formData: FormData) => Promise<ImportOutcome>;
  entityLabel: string;
  template: string;
  templateFilename: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  function downloadTemplate() {
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = templateFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="console-panel rounded-[1.75rem] p-1.5">
      <div className="console-panel-inner overflow-hidden rounded-[1.25rem]">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/80 bg-muted/20 px-5 py-4">
          <div>
            <p className="console-label">Bulk import</p>
            <h2 className="mt-2 font-semibold tracking-tight">Import {entityLabel}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Upload a CSV. Headers are matched flexibly; unknown columns are ignored.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            Template
          </Button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <form action={formAction} className="flex flex-wrap items-center gap-3">
            <Input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="max-w-xs"
              aria-label={`${entityLabel} CSV file`}
            />
            <Button type="submit" disabled={pending}>
              <Upload className="size-4" />
              {pending ? "Importing..." : "Import"}
            </Button>
          </form>

          {state && (
            <div className={cnState(state.ok)} role="status">
              <div className="flex items-center gap-2 text-sm font-medium">
                {state.ok ? (
                  <CheckCircle2 className="size-4 text-primary" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                )}
                {state.message}
              </div>
              {(state.inserted > 0 || state.skipped > 0) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {state.inserted} inserted · {state.skipped} skipped (duplicates) ·{" "}
                  {state.errors.length} row error(s)
                </p>
              )}
              {state.errors.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {state.errors.slice(0, 8).map((e, i) => (
                    <li key={i}>
                      Row {e.row}
                      {e.field ? ` (${e.field})` : ""}: {e.message}
                    </li>
                  ))}
                  {state.errors.length > 8 && <li>and {state.errors.length - 8} more...</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function cnState(ok: boolean): string {
  return [
    "rounded-2xl border p-4",
    ok
      ? "border-border bg-muted/55"
      : "border-amber-300/60 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30",
  ].join(" ");
}
```

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck && npm run build`
Expected: both succeed, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/dashboard/import-panel.tsx
git commit -m "feat(dashboard): rebuild import panel onto console-panel idiom"
```

---

### Task 7: Full verification — gates, then browser (desktop + mobile, light + dark)

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full automated gate suite**

Run: `npm run lint`
Expected: clean, no errors.

Run: `npm run typecheck`
Expected: clean, no errors.

Run: `npm run build`
Expected: succeeds, all routes compile.

Run: `npx vitest run`
Expected: all existing tests pass (baseline: 9 files / 61 tests). This restyle touches no business logic, so the count should be unchanged.

- [ ] **Step 2: Start the dev server and confirm root/dashboard render**

Use `preview_start` (per this environment's launch config) to start the Next.js dev server, then `preview_eval` to confirm `window.location.reload()` picks up a clean load with no thrown errors, then check `preview_console_logs` (level: `error`) — expect empty.

- [ ] **Step 3: Desktop, light mode — walk the core screens**

Navigate to `/dashboard` (overview). Via `preview_screenshot` and `preview_inspect`, confirm: stat tiles render with visible bezel border/shadow (not flat/unstyled), `console-card-hover` lifts a tile on hover (`preview_eval` to dispatch a mouseover or use a real hover if supported), setup checklist and next-steps/demo-workspace panel show the double-bezel + `console-label` kicker.

Navigate to `/dashboard/alerts`. Confirm rules panel and event history render with the same panel treatment; open the evidence drawer (click a signal row via `preview_click`) and confirm its sections use the panel treatment too.

Navigate to `/sign-in`. Confirm the real Clerk card renders (not the `AuthNotConfigured` fallback — Clerk is configured in this environment) with the console-panel bezel around it, teal primary button, correct border radius. Repeat for `/sign-up`.

Confirm the sidebar: active nav item shows a white pill with a teal-tinted icon badge (`border-console-line`/`bg-console-surface-2`); inactive items are legible on the dark `bg-console-rail`.

- [ ] **Step 4: Desktop, dark mode**

`preview_resize` with `colorScheme: "dark"`. Repeat the same screens from Step 3. Confirm: panels stay legible (dark `--card` background, visible border, subtle highlight — not pure black-on-black), the `console-shell` glow doesn't overpower content, shadows read as shadows (not glows — this is the specific risk flagged in the spec around fixed vs. `var(--foreground)`-based shadow colors).

- [ ] **Step 5: Mobile viewport**

`preview_resize` with `preset: "mobile"`. Confirm: no horizontal overflow/layout shift on any of the 4 screens above, mobile topbar nav pills render correctly, evidence drawer is usable at mobile width, Clerk card doesn't overflow its container.

- [ ] **Step 6: Fix-and-recheck loop**

If any issue surfaces in Steps 3–5, read the relevant source file, fix it, and re-run the specific check that failed (not the full loop) before moving on.

- [ ] **Step 7: Share final proof and commit if any fixes were made**

Take a final `preview_screenshot` of `/dashboard` and `/sign-in` (light and dark) as evidence. If Step 6 required any code changes, commit them:

```bash
git add -A
git commit -m "fix(dashboard): address issues found in browser verification"
```

If no fixes were needed, this task ends at Step 5 with no commit.
