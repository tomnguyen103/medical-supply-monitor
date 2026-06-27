import { describe, it, expect } from "vitest";

import { scoreItemRisk, SCORING_VERSION, type ScoringInput } from "./scoring";

const baseInput: ScoringInput = {
  signals: [
    { domain: "shortage", severityScore: 80, confidence: 0.9, stalenessStatus: "fresh" },
    { domain: "recall", severityScore: 40, confidence: 0.7, stalenessStatus: "aging" },
  ],
  daysOnHand: 7,
  isSoleSource: true,
};

describe("scoreItemRisk", () => {
  it("is deterministic: identical inputs produce identical output", () => {
    expect(scoreItemRisk(baseInput)).toEqual(scoreItemRisk(baseInput));
  });

  it("computes a known, reproducible result", () => {
    // worst severity 80*0.6=48, sole-source 100*0.25=25, 7 days-on-hand 50*0.15=7.5
    const r = scoreItemRisk(baseInput);
    expect(r.riskScore).toBe(80.5);
    expect(r.riskLevel).toBe("critical");
    expect(r.confidence).toBe(0.8); // mean(0.9, 0.7)
    expect(r.scoringVersion).toBe(SCORING_VERSION);
  });

  it("is explainable: components are present and sum to the score", () => {
    const r = scoreItemRisk(baseInput);
    const sum = r.components.reduce((s, c) => s + c.contribution, 0);
    expect(r.components.length).toBeGreaterThanOrEqual(3);
    expect(r.riskScore).toBeCloseTo(sum, 5);
    for (const c of r.components) {
      expect(typeof c.factor).toBe("string");
      expect(typeof c.explanation).toBe("string");
    }
  });

  it("clamps the score to the 0-100 range", () => {
    const maxed = scoreItemRisk({
      signals: [{ domain: "shortage", severityScore: 100, confidence: 1 }],
      daysOnHand: 0,
      isSoleSource: true,
    });
    expect(maxed.riskScore).toBeLessThanOrEqual(100);
    expect(maxed.riskScore).toBeGreaterThanOrEqual(0);
  });

  it("handles empty signals without throwing and defaults confidence", () => {
    const r = scoreItemRisk({ signals: [] });
    expect(r.riskScore).toBe(0);
    expect(r.riskLevel).toBe("info");
    expect(r.confidence).toBe(0.5);
  });
});
