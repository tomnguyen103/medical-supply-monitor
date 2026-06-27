/**
 * Deterministic risk scoring (Phase 1 skeleton; weighting lands in Phase 4).
 *
 * Hard requirements (product guardrails):
 *  - DETERMINISTIC: same inputs → same output. No randomness, no clocks, no AI.
 *  - EXPLAINABLE: every score ships a component breakdown a human can read.
 *  - VERSIONED: `SCORING_VERSION` is stamped on every snapshot for audit.
 *  - AUDITABLE: inputs are captured so any score can be reproduced.
 *
 * AI agents may DRAFT prose explanations elsewhere, but the number itself is
 * computed here, by code, never by a model.
 */

import type { RiskScoreComponent } from "@/lib/db/schema";
import type { Severity } from "@/lib/connectors/types";

/** Bump on any change to weights or formula. Snapshots pin this value. */
export const SCORING_VERSION = "v0.1.0";

export interface ScoringInput {
  /** Active signals already matched to the item. */
  signals: Array<{
    domain: string;
    severityScore?: number | null;
    confidence?: number | null;
    stalenessStatus?: string | null;
  }>;
  /** Supply posture (optional in the draft). */
  daysOnHand?: number | null;
  isSoleSource?: boolean;
}

export interface ScoringResult {
  scoringVersion: string;
  riskScore: number; // 0–100
  riskLevel: Severity;
  confidence: number; // 0–1
  components: RiskScoreComponent[];
  rationale: string;
}

function levelFromScore(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "moderate";
  if (score >= 15) return "low";
  return "info";
}

/**
 * Phase 1 placeholder: a transparent, additive blend of matched-signal severity,
 * sole-source exposure, and days-on-hand. Deliberately simple and legible; the
 * Phase 4 engine will refine weights, freshness decay, and per-domain handling.
 */
export function scoreItemRisk(input: ScoringInput): ScoringResult {
  const components: RiskScoreComponent[] = [];

  // 1) Worst matched signal severity (0–100).
  const worstSignal = input.signals.reduce(
    (max, s) => Math.max(max, s.severityScore ?? 0),
    0,
  );
  components.push({
    factor: "matched_signal_severity",
    weight: 0.6,
    rawValue: worstSignal,
    contribution: round(worstSignal * 0.6),
    explanation: `Highest severity among ${input.signals.length} matched signal(s).`,
  });

  // 2) Sole-source exposure.
  const soleSource = input.isSoleSource ? 100 : 0;
  components.push({
    factor: "sole_source_exposure",
    weight: 0.25,
    rawValue: input.isSoleSource ?? false ? "sole_source" : "multi_source",
    contribution: round(soleSource * 0.25),
    explanation: input.isSoleSource
      ? "Item has a single source — disruption risk concentrated."
      : "Item has multiple sources.",
  });

  // 3) Low days-on-hand (under 14 days raises risk).
  const doh = input.daysOnHand ?? null;
  const dohScore = doh === null ? 0 : clamp((14 - doh) / 14, 0, 1) * 100;
  components.push({
    factor: "days_on_hand",
    weight: 0.15,
    rawValue: doh,
    contribution: round(dohScore * 0.15),
    explanation:
      doh === null
        ? "No inventory data; not contributing to score."
        : `~${doh.toFixed(1)} days on hand.`,
  });

  const riskScore = clamp(
    components.reduce((sum, c) => sum + c.contribution, 0),
    0,
    100,
  );

  // Confidence = mean of contributing signal confidences (default 0.5).
  const confidences = input.signals
    .map((s) => s.confidence)
    .filter((c): c is number => typeof c === "number");
  const confidence = confidences.length
    ? round(confidences.reduce((a, b) => a + b, 0) / confidences.length, 2)
    : 0.5;

  const riskLevel = levelFromScore(riskScore);

  return {
    scoringVersion: SCORING_VERSION,
    riskScore: round(riskScore),
    riskLevel,
    confidence,
    components,
    rationale: `${riskLevel.toUpperCase()} (${round(riskScore)}/100) under scoring ${SCORING_VERSION}.`,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
