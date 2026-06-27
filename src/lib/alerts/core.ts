import type {
  RiskDomain,
  Severity,
  StalenessStatus,
} from "@/lib/connectors/types";
import type { RiskScoreComponent } from "@/lib/db/schema";

export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

const STALENESS_RANK: Record<StalenessStatus, number> = {
  fresh: 0,
  unknown: 1,
  aging: 2,
  stale: 3,
  expired: 4,
};

export interface AlertRuleLike {
  id: string;
  name: string;
  domain: RiskDomain | null;
  minSeverity: Severity;
}

export interface SnapshotLike {
  id: string;
  itemId: string;
  itemName: string;
  scoringVersion: string;
  riskScore: number;
  riskLevel: Severity;
  confidence: number | null;
  stalenessStatus: StalenessStatus;
  computedAt: Date;
  components: RiskScoreComponent[];
  inputs: Record<string, unknown>;
  changeSummary: Record<string, unknown> | null;
}

export interface AlertPayload {
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  freshness: Record<string, unknown>;
  confidence: number;
}

export function severityAtLeast(value: Severity, minimum: Severity): boolean {
  return SEVERITY_RANK[value] >= SEVERITY_RANK[minimum];
}

export function snapshotMatchesRule(
  snapshot: SnapshotLike,
  rule: AlertRuleLike,
): boolean {
  if (!severityAtLeast(snapshot.riskLevel, rule.minSeverity)) return false;
  if (!rule.domain) return true;
  return extractSignalDomains(snapshot.inputs).includes(rule.domain);
}

export function buildAlertPayload(
  snapshot: SnapshotLike,
  rule: AlertRuleLike,
): AlertPayload {
  const changed = snapshot.changeSummary?.changed === true;
  const delta =
    typeof snapshot.changeSummary?.deltaScore === "number"
      ? snapshot.changeSummary.deltaScore
      : null;
  const title = `${rule.name}: ${snapshot.itemName} is ${snapshot.riskLevel}`;
  const body = [
    `${snapshot.itemName} scored ${Math.round(snapshot.riskScore)}/100.`,
    changed && delta !== null ? `Score changed by ${delta.toFixed(1)} points.` : null,
    `Scoring version ${snapshot.scoringVersion}.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title,
    body,
    evidence: {
      snapshotId: snapshot.id,
      itemId: snapshot.itemId,
      itemName: snapshot.itemName,
      riskScore: snapshot.riskScore,
      riskLevel: snapshot.riskLevel,
      scoringVersion: snapshot.scoringVersion,
      changeSummary: snapshot.changeSummary,
      componentFactors: snapshot.components.map((component) => component.factor),
    },
    freshness: {
      stalenessStatus: snapshot.stalenessStatus,
      computedAt: snapshot.computedAt.toISOString(),
      signalDomains: extractSignalDomains(snapshot.inputs),
    },
    confidence: snapshot.confidence ?? 0.5,
  };
}

export function buildDailyBriefPayload(
  organizationId: string,
  snapshots: SnapshotLike[],
  asOf: Date,
): AlertPayload | null {
  if (snapshots.length === 0) return null;

  const changedSnapshots = snapshots.filter(
    (snapshot) => snapshot.changeSummary?.changed === true,
  );
  const reviewSnapshots = changedSnapshots.length > 0 ? changedSnapshots : snapshots;
  const highest = [...reviewSnapshots].sort(
    (a, b) =>
      SEVERITY_RANK[b.riskLevel] - SEVERITY_RANK[a.riskLevel] ||
      b.riskScore - a.riskScore,
  )[0];
  if (!highest) return null;

  const avgConfidence =
    reviewSnapshots.reduce((sum, snapshot) => sum + (snapshot.confidence ?? 0.5), 0) /
    reviewSnapshots.length;
  const stalenessStatus = worstStaleness(
    reviewSnapshots.map((snapshot) => snapshot.stalenessStatus),
  );
  const changedLabel =
    changedSnapshots.length === 1
      ? "1 item changed"
      : `${changedSnapshots.length} items changed`;

  return {
    title: `Daily risk brief: ${changedLabel}`,
    body:
      changedSnapshots.length > 0
        ? `${changedLabel} since the previous snapshot. Highest current risk is ${highest.itemName} at ${Math.round(highest.riskScore)}/100.`
        : `No changed scores since the previous snapshot. Highest current risk is ${highest.itemName} at ${Math.round(highest.riskScore)}/100.`,
    evidence: {
      organizationId,
      asOf: asOf.toISOString(),
      changedSnapshotIds: changedSnapshots.map((snapshot) => snapshot.id),
      reviewedSnapshotIds: reviewSnapshots.map((snapshot) => snapshot.id),
      highestRiskSnapshotId: highest.id,
      highestRiskItemId: highest.itemId,
    },
    freshness: {
      stalenessStatus,
      computedAt: asOf.toISOString(),
      snapshotCount: reviewSnapshots.length,
    },
    confidence: round(avgConfidence, 2),
  };
}

export function extractSignalDomains(inputs: Record<string, unknown>): RiskDomain[] {
  const rawSignals = Array.isArray(inputs.signals) ? inputs.signals : [];
  const domains = new Set<RiskDomain>();
  for (const raw of rawSignals) {
    if (!raw || typeof raw !== "object") continue;
    const domain = (raw as { domain?: unknown }).domain;
    if (isRiskDomain(domain)) domains.add(domain);
  }
  return Array.from(domains).sort();
}

function worstStaleness(values: StalenessStatus[]): StalenessStatus {
  if (values.length === 0) return "unknown";
  let worst = values[0] ?? "unknown";
  for (const value of values.slice(1)) {
    if (STALENESS_RANK[value] > STALENESS_RANK[worst]) worst = value;
  }
  return worst;
}

function isRiskDomain(value: unknown): value is RiskDomain {
  return (
    typeof value === "string" &&
    [
      "shortage",
      "recall",
      "supplier",
      "inventory",
      "procurement",
      "weather",
      "disaster",
      "geopolitical",
      "sanctions",
      "cyber",
      "infrastructure",
      "logistics",
      "other",
    ].includes(value)
  );
}

function round(n: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
