import { describe, it, expect } from "vitest";

import type { RiskDomain, StalenessStatus } from "@/lib/connectors/types";
import fixture from "./__fixtures__/scoring-input.json";
import {
  scoreItemRisk,
  SCORING_VERSION,
  summarizeSnapshotChange,
  type ScoringInput,
  type ScoringSignalInput,
} from "./scoring";

const baseInput = fixture as ScoringInput;

describe("scoreItemRisk", () => {
  it("is deterministic for a saved fixture", () => {
    expect(scoreItemRisk(baseInput)).toEqual(scoreItemRisk(baseInput));
  });

  it("canonicalizes signal order before building audit inputs", () => {
    const reversed = {
      ...baseInput,
      signals: [...baseInput.signals].reverse(),
    };

    expect(scoreItemRisk(reversed)).toEqual(scoreItemRisk(baseInput));
  });

  it("computes a known reproducible result", () => {
    const result = scoreItemRisk(baseInput);

    expect(result.scoringVersion).toBe(SCORING_VERSION);
    expect(result.riskScore).toBe(96);
    expect(result.riskLevel).toBe("critical");
    expect(result.confidence).toBe(0.67);
    expect(result.stalenessStatus).toBe("stale");
    expect(result.worstSignalAt?.toISOString()).toBe("2026-06-26T12:00:00.000Z");
  });

  it("is explainable and components sum to the score", () => {
    const result = scoreItemRisk(baseInput);
    const sum = result.components.reduce(
      (total, component) => total + component.contribution,
      0,
    );

    expect(result.components.map((component) => component.factor)).toEqual([
      "signal_shortage",
      "signal_recall",
      "signal_weather",
      "sole_source_exposure",
      "days_on_hand",
    ]);
    expect(result.riskScore).toBeCloseTo(sum, 5);
    for (const component of result.components) {
      expect(component.explanation.length).toBeGreaterThan(0);
    }
  });

  it("captures audit-safe inputs without raw payloads", () => {
    const result = scoreItemRisk(baseInput);

    expect(result.inputs).toMatchObject({
      asOf: "2026-06-27T12:00:00.000Z",
      daysOnHand: 6,
      isSoleSource: true,
    });
    expect(JSON.stringify(result.inputs)).not.toContain("raw");
  });

  it("clamps the score to the 0-100 range", () => {
    const maxed = scoreItemRisk({
      asOf: "2026-06-27T12:00:00.000Z",
      signals: [
        {
          domain: "shortage",
          severityScore: 100,
          confidence: 1,
          stalenessStatus: "fresh",
          lastFetchedAt: "2026-06-27T12:00:00.000Z",
        },
        {
          domain: "recall",
          severityScore: 100,
          confidence: 1,
          stalenessStatus: "fresh",
          lastFetchedAt: "2026-06-27T12:00:00.000Z",
        },
      ],
      daysOnHand: 0,
      isSoleSource: true,
    });
    expect(maxed.riskScore).toBe(100);
    expect(maxed.riskLevel).toBe("critical");
  });

  it("handles empty signals without throwing and defaults confidence", () => {
    const result = scoreItemRisk({
      asOf: "2026-06-27T12:00:00.000Z",
      signals: [],
    });

    expect(result.riskScore).toBe(0);
    expect(result.riskLevel).toBe("info");
    expect(result.confidence).toBe(0.55);
    expect(result.stalenessStatus).toBe("unknown");
  });

  it("does not describe unknown sole-source posture as multi-source", () => {
    const result = scoreItemRisk({
      asOf: "2026-06-27T12:00:00.000Z",
      signals: [],
      isSoleSource: null,
    });
    const soleSource = result.components.find(
      (component) => component.factor === "sole_source_exposure",
    );

    expect(soleSource).toMatchObject({
      rawValue: null,
      contribution: 0,
      explanation: "No sole-source posture is available.",
    });
  });
});

describe("summarizeSnapshotChange", () => {
  it("summarizes the first snapshot without claiming a change", () => {
    const result = scoreItemRisk(baseInput);

    expect(summarizeSnapshotChange(result, null)).toMatchObject({
      status: "initial",
      changed: false,
      deltaScore: null,
      currentRiskLevel: "critical",
    });
  });

  it("summarizes score and level changes from the previous snapshot", () => {
    const result = scoreItemRisk(baseInput);

    expect(
      summarizeSnapshotChange(result, {
        id: "snap-prev",
        riskScore: 45,
        riskLevel: "moderate",
        computedAt: new Date("2026-06-26T12:00:00.000Z"),
      }),
    ).toMatchObject({
      status: "compared",
      changed: true,
      direction: "increased",
      deltaScore: 51,
      previousSnapshotId: "snap-prev",
      previousRiskLevel: "moderate",
      currentRiskLevel: "critical",
    });
  });
});

describe("scoreItemRisk monotonicity (A20)", () => {
  const ALL_DOMAINS: RiskDomain[] = [
    "shortage",
    "recall",
    "inventory",
    "procurement",
    "supplier",
    "sanctions",
    "cyber",
    "disaster",
    "weather",
    "geopolitical",
    "infrastructure",
    "logistics",
    "other",
  ];
  const STALENESS_OPTIONS: StalenessStatus[] = [
    "fresh",
    "aging",
    "stale",
    "expired",
    "unknown",
  ];
  const ASOF = "2026-06-27T12:00:00.000Z";

  // Deterministic PRNG so a failing trial is reproducible from its seed.
  function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick<T>(values: T[], rand: () => number): T {
    const value = values[Math.floor(rand() * values.length)];
    if (value === undefined) throw new Error("pick: values must be non-empty");
    return value;
  }

  function shuffled<T>(values: T[], rand: () => number): T[] {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const a = copy[i];
      const b = copy[j];
      if (a === undefined || b === undefined) continue;
      copy[i] = b;
      copy[j] = a;
    }
    return copy;
  }

  function randomSignal(rand: () => number, domain: RiskDomain): ScoringSignalInput {
    return {
      domain,
      severityScore: Math.round(rand() * 100),
      confidence: Math.round(rand() * 100) / 100,
      stalenessStatus: pick(STALENESS_OPTIONS, rand),
      lastFetchedAt: ASOF,
    };
  }

  it("never decreases the risk score when one more signal is added, across randomized signal sets", () => {
    const trials = 300;
    for (let trial = 0; trial < trials; trial++) {
      const rand = mulberry32(trial + 1);
      const baseCount = 1 + Math.floor(rand() * (ALL_DOMAINS.length - 1));
      const baseDomains = shuffled(ALL_DOMAINS, rand).slice(0, baseCount);
      const baseSignals = baseDomains.map((domain) => randomSignal(rand, domain));
      const daysOnHand = Math.round(rand() * 60);
      const isSoleSource = rand() > 0.5;

      const before = scoreItemRisk({
        asOf: ASOF,
        signals: baseSignals,
        daysOnHand,
        isSoleSource,
      });

      // The extra signal may land on an already-represented domain (only
      // raises the bar if stronger than the existing one) or a brand-new
      // domain (which can reorder the whole ranked allocation) - both must
      // hold under the monotonicity guarantee.
      const extraDomain = pick(ALL_DOMAINS, rand);
      const after = scoreItemRisk({
        asOf: ASOF,
        signals: [...baseSignals, randomSignal(rand, extraDomain)],
        daysOnHand,
        isSoleSource,
      });

      expect(
        after.riskScore,
        `trial ${trial} regressed: before=${before.riskScore} after=${after.riskScore} ` +
          `baseDomains=${JSON.stringify(baseDomains)} extraDomain=${extraDomain}`,
      ).toBeGreaterThanOrEqual(before.riskScore);
    }
  });
});
