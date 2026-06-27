import Link from "next/link";
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Database,
  FileText,
  Gauge,
  GitCompare,
  ListChecks,
  ShieldCheck,
  Target,
  Workflow,
} from "lucide-react";

import { BrandMark } from "@/components/brand";
import { RiskPreview } from "@/components/risk-preview";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PROMISE = [
  {
    icon: Target,
    title: "What's at risk",
    body: "Critical items ranked by disruption likelihood and impact.",
  },
  {
    icon: FileText,
    title: "Why",
    body: "Every score traces to the signals and evidence behind it.",
  },
  {
    icon: GitCompare,
    title: "What changed",
    body: "A daily diff since yesterday, not a static dashboard.",
  },
  {
    icon: ListChecks,
    title: "What to review",
    body: "A short, prioritized list for your procurement team.",
  },
];

const STEPS = [
  {
    icon: Database,
    title: "Connect",
    body: "Import your item master, suppliers, inventory, and open POs by CSV.",
  },
  {
    icon: Workflow,
    title: "Normalize",
    body: "FDA shortages, recalls, sanctions, and weather map into one risk-signal model.",
  },
  {
    icon: Gauge,
    title: "Score",
    body: "A deterministic, versioned engine scores each item. No black boxes.",
  },
  {
    icon: FileText,
    title: "Brief",
    body: "An assistant drafts the daily brief. People approve anything critical.",
  },
  {
    icon: Bell,
    title: "Alert",
    body: "Slack and email alerts, each with evidence, freshness, and confidence.",
  },
];

const GUARDRAILS = [
  "No PHI and no patient-level data",
  "No EHR integration",
  "No diagnosis, treatment, or substitution advice",
  "Deterministic, explainable, versioned scoring",
  "Evidence, freshness, and confidence on every alert",
  "Human approval required for critical alerts",
  "Strict tenant isolation per organization",
];

export default function LandingPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {/* Navigation — single line, under 72px */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <BrandMark />
          <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
            <Link href="#how" className="transition-colors hover:text-foreground">
              How it works
            </Link>
            <Link href="#security" className="transition-colors hover:text-foreground">
              Security
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/sign-in"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
            >
              Sign in
            </Link>
            <Link href="/sign-up" className={buttonVariants({ size: "sm" })}>
              Request access
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — asymmetric split */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(60% 50% at 70% 0%, color-mix(in oklch, var(--color-primary) 12%, transparent), transparent)",
            }}
          />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-20 pt-16 lg:grid-cols-2 lg:gap-10 lg:pt-24">
            <div className="msm-rise">
              <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                Catch supply risk before it becomes a shortage.
              </h1>
              <p className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
                Monitor critical supplies for shortages, recalls, and supplier
                disruption. A daily brief of what changed and what to review.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/sign-up"
                  className={cn(buttonVariants({ size: "lg" }), "gap-2")}
                >
                  Request access
                  <ArrowRight className="size-4" />
                </Link>
                <Link
                  href="#how"
                  className={buttonVariants({ variant: "outline", size: "lg" })}
                >
                  How it works
                </Link>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">
                For hospital supply chain, pharmacy procurement, and materials
                management teams.
              </p>
            </div>
            <div className="msm-rise lg:pl-4">
              <RiskPreview />
            </div>
          </div>
        </section>

        {/* Promise band — four questions, dividers not cards */}
        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-border">
            {PROMISE.map((p) => (
              <div key={p.title} className="py-8 lg:px-6 lg:first:pl-0 lg:last:pr-0">
                <p.icon className="size-5 text-primary" strokeWidth={1.75} />
                <h2 className="mt-3 text-sm font-semibold">{p.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works — horizontal pipeline */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20 sm:py-24">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight">
              From scattered feeds to one daily brief.
            </h2>
            <p className="mt-3 text-muted-foreground">
              A source-agnostic pipeline that survives without any single feed.
            </p>
          </div>
          <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative">
                <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-card">
                  <step.icon className="size-5 text-primary" strokeWidth={1.75} />
                </div>
                <h3 className="mt-4 font-medium">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                {i < STEPS.length - 1 && (
                  <ArrowRight
                    aria-hidden
                    className="absolute -right-3 top-2.5 hidden size-4 text-border lg:block"
                  />
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Security and guardrails — two-column, right side carries real content */}
        <section
          id="security"
          className="scroll-mt-20 border-t border-border bg-muted/30"
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 sm:py-24 lg:grid-cols-2 lg:gap-16">
            <div>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-primary">
                <ShieldCheck className="size-4" strokeWidth={1.75} />
                Operations, not clinical decisions
              </span>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                Built to stay out of the clinical path by design.
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-muted-foreground">
                This is a supply-resilience tool for operations teams. The
                guardrails are part of the product, not a setting you can turn
                off.
              </p>
            </div>
            <ul className="grid gap-3 self-center">
              {GUARDRAILS.map((g) => (
                <li key={g} className="flex items-start gap-3">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-primary"
                    strokeWidth={1.75}
                  />
                  <span className="text-sm leading-relaxed">{g}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
          <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center shadow-sm sm:px-12">
            <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight">
              Bring shortage monitoring out of the spreadsheet.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
              Stand up a monitored catalog and start receiving daily briefs.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/sign-up"
                className={cn(buttonVariants({ size: "lg" }), "gap-2")}
              >
                Request access
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-sm">
              <BrandMark />
              <p className="mt-3 text-sm text-muted-foreground">
                Critical medical supply resilience monitoring for hospital supply
                chain and pharmacy procurement teams.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link href="#how" className="hover:text-foreground">
                How it works
              </Link>
              <Link href="#security" className="hover:text-foreground">
                Security
              </Link>
              <Link href="/sign-in" className="hover:text-foreground">
                Sign in
              </Link>
            </nav>
          </div>
          <p className="mt-8 border-t border-border pt-6 text-xs text-muted-foreground">
            Not a clinical decision support system. No PHI, no EHR integration,
            and no treatment guidance. Sample figures shown are illustrative.
          </p>
        </div>
      </footer>
    </div>
  );
}
