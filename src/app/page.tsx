import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check, Radar } from "lucide-react";

import { RiskPreview } from "@/components/risk-preview";
import { Reveal } from "@/components/reveal";

/* ---------------------------------------------------------------- content -- */

const SOURCES = [
  "openFDA Drug Shortages",
  "FDA Enforcement Reports",
  "NOAA Weather Alerts",
  "OFAC Sanctions",
  "Supplier Lead Times",
];

const PROMISE = [
  {
    kicker: "At risk",
    head: "What could disrupt",
    body: "Critical items ranked by disruption likelihood and clinical impact.",
  },
  {
    kicker: "Why",
    head: "The evidence behind it",
    body: "Every score traces to the signals and sources it was built from.",
  },
  {
    kicker: "Changed",
    head: "A diff since yesterday",
    body: "What moved overnight — a living brief, not a static dashboard.",
  },
  {
    kicker: "Review",
    head: "What to act on first",
    body: "A short, prioritized list your procurement team can work today.",
  },
];

const STEPS = [
  {
    title: "Connect",
    body: "Import your item master, suppliers, inventory, and open POs by CSV.",
  },
  {
    title: "Normalize",
    body: "Shortages, recalls, sanctions, and weather map into one signal model.",
  },
  {
    title: "Score",
    body: "A deterministic, versioned engine scores each item. No black boxes.",
  },
  {
    title: "Brief",
    body: "An assistant drafts the daily brief; people approve anything critical.",
  },
  {
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

/* ----------------------------------------------------------------- pieces -- */

function Wordmark({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-petrol text-paper shadow-[inset_0_1px_0_rgb(255_255_255/0.18)]">
        <Radar className="size-4" strokeWidth={1.75} />
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-data text-[9px] uppercase tracking-[0.22em] text-ink-faint">
          Critical Supply
        </span>
        <span
          className={
            size === "lg"
              ? "mt-1 font-display text-[19px] font-medium tracking-tight text-ink"
              : "mt-0.5 font-display text-[15px] font-medium tracking-tight text-ink"
          }
        >
          Resilience Monitor
        </span>
      </span>
    </Link>
  );
}

function CtaPrimary({
  href,
  children,
  tone = "petrol",
}: {
  href: string;
  children: ReactNode;
  tone?: "petrol" | "paper";
}) {
  const onPaper = tone === "petrol";
  return (
    <Link
      href={href}
      className={[
        "group inline-flex items-center gap-3 rounded-full py-2 pl-6 pr-2 text-[15px] font-medium outline-none transition-[transform,background-color,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-offset-2",
        onPaper
          ? "bg-petrol text-paper shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_14px_28px_-16px_rgb(14_79_77/0.85)] hover:bg-petrol-deep focus-visible:ring-petrol/45 focus-visible:ring-offset-paper"
          : "bg-paper text-ink shadow-[0_14px_28px_-16px_rgb(0_0_0/0.5)] hover:bg-white focus-visible:ring-paper/60 focus-visible:ring-offset-petrol-deep",
      ].join(" ")}
    >
      <span>{children}</span>
      <span
        className={[
          "grid size-8 place-items-center rounded-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px",
          onPaper ? "bg-paper/15" : "bg-ink/10",
        ].join(" ")}
      >
        <ArrowRight className="size-4" strokeWidth={1.75} />
      </span>
    </Link>
  );
}

function CtaGhost({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-full border border-hairline-strong px-6 py-2.5 text-[15px] font-medium text-ink outline-none transition-colors duration-300 hover:border-ink/30 hover:bg-paper-sunk focus-visible:ring-2 focus-visible:ring-petrol/40 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
    >
      {children}
    </Link>
  );
}

function CalibRule() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6">
      <div className="calib-rule" aria-hidden />
    </div>
  );
}

/* ------------------------------------------------------------------- page -- */

export default function LandingPage() {
  return (
    <div className="theme-desk flex min-h-[100dvh] flex-col bg-paper font-body text-ink antialiased">
      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-hairline bg-paper/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <nav className="hidden items-center gap-8 font-data text-[12px] uppercase tracking-[0.14em] text-ink-soft md:flex">
            <Link href="#how" className="transition-colors hover:text-ink">
              How it works
            </Link>
            <Link href="#security" className="transition-colors hover:text-ink">
              Security
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="hidden text-[14px] font-medium text-ink-soft transition-colors hover:text-ink sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="inline-flex items-center rounded-full bg-petrol px-5 py-2 text-[14px] font-medium text-paper outline-none transition-colors duration-300 hover:bg-petrol-deep focus-visible:ring-2 focus-visible:ring-petrol/45 focus-visible:ring-offset-2 focus-visible:ring-offset-paper active:scale-[0.98]"
            >
              Request access
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero — editorial split */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(48% 38% at 80% 6%, color-mix(in oklch, var(--petrol) 9%, transparent), transparent 70%)",
            }}
          />
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-x-12 gap-y-14 px-6 pb-20 pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-24">
            <Reveal className="stagger">
              <p className="eyebrow">For hospital supply chain &amp; pharmacy</p>
              <h1 className="mt-6 font-display text-[clamp(2.5rem,1.4rem+3.9vw,4.4rem)] font-medium leading-[1.02] tracking-[-0.022em] text-ink">
                The shortage you see coming is the one you can{" "}
                <em className="font-medium italic text-petrol">prevent</em>.
              </h1>
              <p className="mt-7 max-w-[46ch] text-[17px] leading-relaxed text-ink-soft">
                A daily intelligence brief on the medical supplies most likely to
                disrupt care — what&rsquo;s at risk, why, what changed, and what
                your team should act on first.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <CtaPrimary href="/sign-up">Request access</CtaPrimary>
                <CtaGhost href="#how">See how it works</CtaGhost>
              </div>
              <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2 font-data text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                <li>No PHI</li>
                <li aria-hidden className="text-brass">
                  ·
                </li>
                <li>No EHR access</li>
                <li aria-hidden className="text-brass">
                  ·
                </li>
                <li>Explainable scoring</li>
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <RiskPreview />
              <p className="mt-4 text-center font-data text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                The product surface — illustrative data
              </p>
            </Reveal>
          </div>
        </section>

        {/* Sources strip */}
        <section className="border-y border-hairline bg-paper-sunk/60">
          <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-7 lg:flex-row lg:items-center lg:gap-10">
            <p className="shrink-0 font-data text-[11px] uppercase tracking-[0.2em] text-ink-faint">
              Signals we read
            </p>
            <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
              {SOURCES.map((s) => (
                <li
                  key={s}
                  className="flex items-center gap-2.5 text-[13px] font-medium text-ink-soft"
                >
                  <span aria-hidden className="size-1 rounded-full bg-brass" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Promise — four answers */}
        <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
          <Reveal>
            <p className="eyebrow">Every morning</p>
            <h2 className="mt-5 max-w-2xl font-display text-[clamp(1.9rem,1.2rem+2.2vw,2.9rem)] font-medium leading-[1.06] tracking-[-0.02em]">
              Four answers, before your first meeting.
            </h2>
          </Reveal>
          <Reveal className="stagger mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-4">
            {PROMISE.map((p) => (
              <div key={p.kicker} className="bg-paper p-7 lg:p-8">
                <p className="font-data text-[10px] uppercase tracking-[0.2em] text-brass">
                  {p.kicker}
                </p>
                <h3 className="mt-4 font-display text-[18px] font-medium leading-snug text-ink">
                  {p.head}
                </h3>
                <p className="mt-2.5 text-[14px] leading-relaxed text-ink-soft">
                  {p.body}
                </p>
              </div>
            ))}
          </Reveal>
        </section>

        <CalibRule />

        {/* How it works — real 01–05 sequence */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-24 px-6 py-24 sm:py-28">
          <Reveal>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-5 max-w-2xl font-display text-[clamp(1.9rem,1.2rem+2.2vw,2.9rem)] font-medium leading-[1.06] tracking-[-0.02em]">
              From scattered public feeds to one daily brief.
            </h2>
            <p className="mt-4 max-w-xl text-[16px] leading-relaxed text-ink-soft">
              A source-agnostic pipeline that survives the loss of any single feed.
            </p>
          </Reveal>
          <Reveal className="stagger mt-16 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, i) => (
              <div key={step.title}>
                <div className="flex items-center gap-3">
                  <span className="font-data text-[12px] tabular-nums text-ink-faint">
                    0{i + 1}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-hairline-strong" />
                </div>
                <h3 className="mt-5 font-display text-[19px] font-medium text-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </div>
            ))}
          </Reveal>
        </section>

        {/* Security & guardrails — manifesto */}
        <section
          id="security"
          className="scroll-mt-24 border-y border-hairline bg-paper-sunk/50"
        >
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-6 py-24 sm:py-28 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <p className="eyebrow">Operations, not clinical decisions</p>
              <h2 className="mt-5 font-display text-[clamp(1.9rem,1.2rem+2.2vw,2.9rem)] font-medium leading-[1.06] tracking-[-0.02em]">
                Built to stay out of the clinical path — by design.
              </h2>
              <p className="mt-6 max-w-md text-[16px] leading-relaxed text-ink-soft">
                This is a supply-resilience tool for operations teams. The
                guardrails aren&rsquo;t a setting you can turn off — they&rsquo;re
                part of the product.
              </p>
            </Reveal>
            <Reveal className="self-center">
              <ul className="grid gap-px overflow-hidden rounded-2xl border border-hairline bg-hairline">
                {GUARDRAILS.map((g) => (
                  <li
                    key={g}
                    className="flex items-start gap-3.5 bg-paper px-5 py-4"
                  >
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-petrol/25 bg-petrol/[0.06] text-petrol">
                      <Check className="size-3" strokeWidth={2.25} />
                    </span>
                    <span className="text-[14.5px] leading-relaxed text-ink">
                      {g}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Closing plate — the one dark moment */}
        <section className="mx-auto max-w-6xl px-6 py-24 sm:py-28">
          <Reveal>
            <div className="relative overflow-hidden rounded-[28px] bg-petrol-deep px-8 py-16 text-center shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_40px_80px_-40px_rgb(14_79_77/0.6)] sm:px-12 sm:py-20">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(60% 80% at 50% -10%, rgb(255 255 255 / 0.08), transparent 60%)",
                }}
              />
              <p className="relative font-data text-[11px] uppercase tracking-[0.22em] text-paper/55">
                Start monitoring
              </p>
              <h2 className="relative mx-auto mt-5 max-w-2xl font-display text-[clamp(2rem,1.3rem+2.6vw,3.2rem)] font-medium leading-[1.05] tracking-[-0.02em] text-paper">
                Bring shortage monitoring out of the spreadsheet.
              </h2>
              <p className="relative mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-paper/70">
                Stand up a monitored catalog and start receiving your daily brief.
              </p>
              <div className="relative mt-9 flex justify-center">
                <CtaPrimary href="/sign-up" tone="paper">
                  Request access
                </CtaPrimary>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-hairline">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-sm">
              <Wordmark size="lg" />
              <p className="mt-5 text-[14px] leading-relaxed text-ink-soft">
                Critical medical supply resilience monitoring for hospital supply
                chain and pharmacy procurement teams.
              </p>
            </div>
            <nav className="flex flex-wrap gap-x-8 gap-y-2 font-data text-[12px] uppercase tracking-[0.14em] text-ink-soft">
              <Link href="#how" className="transition-colors hover:text-ink">
                How it works
              </Link>
              <Link href="#security" className="transition-colors hover:text-ink">
                Security
              </Link>
              <Link href="/sign-in" className="transition-colors hover:text-ink">
                Sign in
              </Link>
            </nav>
          </div>
          <div className="mt-12 calib-rule" aria-hidden />
          <p className="mt-6 max-w-3xl text-[12px] leading-relaxed text-ink-faint">
            Not a clinical decision support system. No PHI, no EHR integration, and
            no treatment guidance. Sample figures shown are illustrative.
          </p>
        </div>
      </footer>
    </div>
  );
}
