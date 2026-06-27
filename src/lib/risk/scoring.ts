/**
 * Deterministic risk scoring.
 *
 * Hard requirements:
 *  - DETERMINISTIC: same inputs and asOf timestamp produce the same output.
 *  - EXPLAINABLE: every score includes a component breakdown.
 *  - VERSIONED: every snapshot stores this version for audit.
 *  - AUDITABLE: inputs are captured without raw provider payloads.
 *
 * AI agents may draft prose elsewhere. They never compute the risk number.
 */

import type {
  RiskDomain,
  Severity,
  StalenessStatus,
} from "@/lib/connectors/types";
import type { RiskScoreComponent } from "@/lib/db/schema";

/** Bump on any change to weights or formula. Snapshots pin this value. */
export const SCORING_VERSION = "v0.2.0";

const SIGNAL_COMPONENT_CAP = 65;
const DAYS_ON_HAND_CAP = 20;
const SOLE_SOURCE_CAP = 15;

const DOMAIN_WEIGHTS: Record<RiskDomain, number> = {
  shortage: 1,
  recall: 0.92,
  inventory: 0.82,
  procurement: 0.74,
  supplier: 0.68,
  sanctions: 0.66,
  cyber: 0.62,
  disaster: 0.58,
  weather: 0.54,
  geopolitical: 0.5,
  infrastructure: 0.48,
  logistics: 0.46,
  other: 0.3,
};

const STALENESS_DECAY: Record<StalenessStatus, number> = {
  fresh: 1,
  aging: 0.78,
  stale: 0.5,
  expired: 0.22,
  unknown: 0.62,
};

const STALENESS_RANK: Record<StalenessStatus, number> = {
  fresh: 0,
  unknown: 1,
  aging: 2,
  stale: 3,
  expired: 4,
};

export interface ScoringSignalInput {
  id?: string;
  domain: RiskDomain;
  severityScore?: number | null;
  confidence?: number | null;
  stalenessStatus?: StalenessStatus | null;
  observedAt?: Date | string | null;
  sourcePublishedAt?: Date | string | null;
  lastFetchedAt?: Date | string | null;
}

export interface ScoringInput {
  /** Explicit clock value. Do not call Date.now() inside the scorer. */
  asOf: Date | string;
  /** Active signals already matched to the item. */
  signals: ScoringSignalInput[];
  /** Aggregate inventory posture. */
  daysOnHand?: number | null;
  /** Supply concentration posture. */
  isSoleSource?: boolean | null;
}

export interface ScoringResult {
  scoringVersion: string;
  riskScore: number;
  riskLevel: Severity;
  confidence: number;
  stalenessStatus: StalenessStatus;
  worstSignalAt: Date | null;
  components: RiskScoreComponent[];
  inputs: Record<string, unknown>;
  rationale: string;
}

interface PreparedSignal {
  id?: string;
  domain: RiskDomain;
  severityScore: number;
  confidence: number;
  stalenessStatus: StalenessStatus;
  effectiveAt: Date | null;
  freshnessMultiplier: number;
  adjustedSeverity: number;
}

function levelFromScore(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "moderate";
  if (score >= 15) return "low";
  return "info";
}

export function scoreItemRisk(input: ScoringInput): ScoringResult {
  const asOf = parseRequiredDate(input.asOf, "asOf");
  const signals = input.signals.map((signal) => prepareSignal(signal, asOf));
  const components: RiskScoreComponent[] = [
    ...scoreSignalDomains(signals),
    scoreSoleSource(input.isSoleSource),
    scoreDaysOnHand(input.daysOnHand),
  ];

  const riskScore = round(
    clamp(
      components.reduce((sum, component) => sum + component.contribution, 0),
      0,
      100,
    ),
  );
  const riskLevel = levelFromScore(riskScore);
  const confidence = calculateConfidence(signals, input);
  const stalenessStatus = aggregateStaleness(signals);
  const worstSignalAt = getWorstSignalAt(signals);
  const inputs = buildAuditInputs(input, signals, asOf);

  return {
    scoringVersion: SCORING_VERSION,
    riskScore,
    riskLevel,
    confidence,
    stalenessStatus,
    worstSignalAt,
    components,
    inputs,
    rationale: `${formatLevel(riskLevel)} risk score ${riskScore}/100 under ${SCORING_VERSION}.`,
  };
}

export function summarizeSnapshotChange(
  current: Pick<ScoringResult, "riskScore" | "riskLevel">,
  previous:
    | {
        id: string;
        riskScore: number;
        riskLevel: Severity;
        computedAt: Date;
      }
    | null
    | undefined,
): Record<string, unknown> {
  if (!previous) {
    return {
      status: "initial",
      changed: false,
      deltaScore: null,
      previousSnapshotId: null,
      previousRiskLevel: null,
      currentRiskLevel: current.riskLevel,
    };
  }

  const deltaScore = round(current.riskScore - previous.riskScore);
  const changed = deltaScore !== 0 || previous.riskLevel !== current.riskLevel;
  const direction =
    deltaScore > 0 ? "increased" : deltaScore < 0 ? "decreased" : "unchanged";

  return {
    status: "compared",
    changed,
    direction,
    deltaScore,
    previousSnapshotId: previous.id,
    previousComputedAt: previous.computedAt.toISOString(),
    previousRiskLevel: previous.riskLevel,
    currentRiskLevel: current.riskLevel,
  };
}

function scoreSignalDomains(signals: PreparedSignal[]): RiskScoreComponent[] {
  if (signals.length === 0) {
    return [
      {
        factor: "matched_signal_domains",
        weight: 0,
        rawValue: 0,
        contribution: 0,
        explanation: "No matched active signals.",
      },
    ];
  }

  const strongestByDomain = new Map<RiskDomain, PreparedSignal>();
  for (const signal of signals) {
    const existing = strongestByDomain.get(signal.domain);
    if (!existing || signal.adjustedSeverity > existing.adjustedSeverity) {
      strongestByDomain.set(signal.domain, signal);
    }
  }

  const domainSignals = Array.from(strongestByDomain.values()).sort((a, b) =>
    a.domain.localeCompare(b.domain),
  );
  const totalWeight = domainSignals.reduce(
    (sum, signal) => sum + DOMAIN_WEIGHTS[signal.domain],
    0,
  );

  return domainSignals.map((signal) => {
    const normalizedWeight = DOMAIN_WEIGHTS[signal.domain] / totalWeight;
    return {
      factor: `signal_${signal.domain}`,
      weight: round(normalizedWeight, 3),
      rawValue: signal.severityScore,
      contribution: round(
        signal.adjustedSeverity * normalizedWeight * SIGNAL_COMPONENT_CAP,
      ),
      explanation: `${formatDomain(signal.domain)} signal after freshness decay.`,
      signalIds: signal.id ? [signal.id] : undefined,
    };
  });
}

function scoreSoleSource(isSoleSource: boolean | null | undefined): RiskScoreComponent {
  const contribution = isSoleSource ? SOLE_SOURCE_CAP : 0;
  return {
    factor: "sole_source_exposure",
    weight: SOLE_SOURCE_CAP / 100,
    rawValue: isSoleSource ? "sole_source" : "multi_source_or_unknown",
    contribution,
    explanation: isSoleSource
      ? "Single-source supply concentration adds risk."
      : "No single-source concentration is flagged.",
  };
}

function scoreDaysOnHand(daysOnHand: number | null | undefined): RiskScoreComponent {
  if (daysOnHand == null || !Number.isFinite(daysOnHand)) {
    return {
      factor: "days_on_hand",
      weight: DAYS_ON_HAND_CAP / 100,
      rawValue: null,
      contribution: 0,
      explanation: "No aggregate inventory days-on-hand value.",
    };
  }

  const posture = clamp((30 - daysOnHand) / 30, 0, 1);
  return {
    factor: "days_on_hand",
    weight: DAYS_ON_HAND_CAP / 100,
    rawValue: round(daysOnHand),
    contribution: round(posture * DAYS_ON_HAND_CAP),
    explanation: `${round(daysOnHand)} days on hand.`,
  };
}

function prepareSignal(
  signal: ScoringSignalInput,
  asOf: Date,
): PreparedSignal {
  const stalenessStatus = signal.stalenessStatus ?? "unknown";
  const effectiveAt =
    parseOptionalDate(signal.observedAt) ??
    parseOptionalDate(signal.sourcePublishedAt) ??
    parseOptionalDate(signal.lastFetchedAt);
  const freshnessMultiplier = Math.min(
    STALENESS_DECAY[stalenessStatus],
    dateDecay(effectiveAt, asOf),
  );
  const severityScore = clamp(signal.severityScore ?? 0, 0, 100);

  return {
    id: signal.id,
    domain: signal.domain,
    severityScore,
    confidence: clamp(signal.confidence ?? 0.5, 0, 1),
    stalenessStatus,
    effectiveAt,
    freshnessMultiplier,
    adjustedSeverity: round((severityScore / 100) * freshnessMultiplier, 4),
  };
}

function dateDecay(effectiveAt: Date | null, asOf: Date): number {
  if (!effectiveAt) return 0.62;
  const ageDays = Math.max(
    0,
    (asOf.getTime() - effectiveAt.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (ageDays <= 7) return 1;
  if (ageDays <= 30) return 0.86;
  if (ageDays <= 90) return 0.62;
  if (ageDays <= 180) return 0.4;
  return 0.22;
}

function calculateConfidence(signals: PreparedSignal[], input: ScoringInput): number {
  const signalConfidence =
    signals.length === 0
      ? 0.5
      : signals.reduce(
          (sum, signal) => sum + signal.confidence * signal.freshnessMultiplier,
          0,
        ) / signals.length;
  const postureCompleteness = input.daysOnHand == null ? 0.85 : 1;
  return round(clamp(signalConfidence * 0.85 + postureCompleteness * 0.15, 0, 1), 2);
}

function aggregateStaleness(signals: PreparedSignal[]): StalenessStatus {
  if (signals.length === 0) return "unknown";
  return signals.reduce<StalenessStatus>((worst, signal) => {
    return STALENESS_RANK[signal.stalenessStatus] > STALENESS_RANK[worst]
      ? signal.stalenessStatus
      : worst;
  }, "fresh");
}

function getWorstSignalAt(signals: PreparedSignal[]): Date | null {
  const worst = signals.reduce<PreparedSignal | null>((current, signal) => {
    if (!current || signal.adjustedSeverity > current.adjustedSeverity) return signal;
    return current;
  }, null);
  return worst?.effectiveAt ?? null;
}

function buildAuditInputs(
  input: ScoringInput,
  signals: PreparedSignal[],
  asOf: Date,
): Record<string, unknown> {
  return {
    asOf: asOf.toISOString(),
    daysOnHand: input.daysOnHand ?? null,
    isSoleSource: input.isSoleSource ?? null,
    signals: signals.map((signal) => ({
      id: signal.id ?? null,
      domain: signal.domain,
      severityScore: signal.severityScore,
      confidence: signal.confidence,
      stalenessStatus: signal.stalenessStatus,
      effectiveAt: signal.effectiveAt?.toISOString() ?? null,
      freshnessMultiplier: signal.freshnessMultiplier,
    })),
  };
}

function parseRequiredDate(value: Date | string, field: string): Date {
  const date = parseOptionalDate(value);
  if (!date) throw new Error(`${field} must be a valid date.`);
  return date;
}

function parseOptionalDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDomain(domain: RiskDomain): string {
  return domain.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatLevel(level: Severity): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
