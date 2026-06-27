import { describe, it, expect } from "vitest";

import fixture from "./__fixtures__/scoring-input.json";
import {
  scoreItemRisk,
  SCORING_VERSION,
  summarizeSnapshotChange,
  type ScoringInput,
} from "./scoring";

const baseInput = fixture as ScoringInput;

describe("scoreItemRisk", () => {
  it("is deterministic for a saved fixture", () => {
    expect(scoreItemRisk(baseInput)).toEqual(scoreItemRisk(baseInput));
  });

  it("computes a known reproducible result", () => {
    const result = scoreItemRisk(baseInput);

    expect(result.scoringVersion).toBe(SCORING_VERSION);
    expect(result.riskScore).toBe(71);
    expect(result.riskLevel).toBe("high");
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
      "signal_recall",
      "signal_shortage",
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
});

describe("summarizeSnapshotChange", () => {
  it("summarizes the first snapshot without claiming a change", () => {
    const result = scoreItemRisk(baseInput);

    expect(summarizeSnapshotChange(result, null)).toMatchObject({
      status: "initial",
      changed: false,
      deltaScore: null,
      currentRiskLevel: "high",
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
      deltaScore: 26,
      previousSnapshotId: "snap-prev",
      previousRiskLevel: "moderate",
      currentRiskLevel: "high",
    });
  });
});
