import { describe, expect, it } from "vitest";

import {
  buildAlertPayload,
  buildDailyBriefPayload,
  extractSignalDomains,
  severityAtLeast,
  snapshotMatchesRule,
  type SnapshotLike,
} from "./core";

const snapshot: SnapshotLike = {
  id: "snap-1",
  itemId: "item-1",
  itemName: "Sterile saline",
  scoringVersion: "v0.2.0",
  riskScore: 82,
  riskLevel: "critical",
  confidence: 0.86,
  stalenessStatus: "aging",
  computedAt: new Date("2026-06-27T12:00:00.000Z"),
  components: [
    {
      factor: "signal_shortage",
      weight: 0.7,
      rawValue: 90,
      contribution: 58,
      explanation: "Shortage signal after freshness decay.",
      signalIds: ["sig-1"],
    },
  ],
  inputs: {
    signals: [
      { id: "sig-1", domain: "shortage" },
      { id: "sig-2", domain: "recall" },
    ],
  },
  changeSummary: {
    changed: true,
    deltaScore: 12.4,
  },
};

describe("alert core helpers", () => {
  it("orders severity deterministically", () => {
    expect(severityAtLeast("critical", "high")).toBe(true);
    expect(severityAtLeast("moderate", "high")).toBe(false);
  });

  it("extracts unique sorted signal domains from snapshot inputs", () => {
    expect(extractSignalDomains(snapshot.inputs)).toEqual(["recall", "shortage"]);
  });

  it("matches rules by minimum severity and optional domain", () => {
    expect(
      snapshotMatchesRule(snapshot, {
        id: "rule-1",
        name: "High shortage",
        minSeverity: "high",
        domain: "shortage",
      }),
    ).toBe(true);
    expect(
      snapshotMatchesRule(snapshot, {
        id: "rule-2",
        name: "Cyber only",
        minSeverity: "high",
        domain: "cyber",
      }),
    ).toBe(false);
  });

  it("builds alert payloads with evidence, freshness, and confidence", () => {
    const payload = buildAlertPayload(snapshot, {
      id: "rule-1",
      name: "High shortage",
      minSeverity: "high",
      domain: "shortage",
    });

    expect(payload.title).toContain("Sterile saline");
    expect(payload.evidence).toMatchObject({
      snapshotId: "snap-1",
      itemId: "item-1",
      riskLevel: "critical",
    });
    expect(payload.freshness).toMatchObject({
      stalenessStatus: "aging",
      signalDomains: ["recall", "shortage"],
    });
    expect(payload.confidence).toBe(0.86);
  });

  it("builds a changed-since-previous daily brief payload", () => {
    const payload = buildDailyBriefPayload("org-1", [snapshot], snapshot.computedAt);

    expect(payload).toMatchObject({
      title: "Daily risk brief: 1 item changed",
      confidence: 0.86,
      freshness: {
        stalenessStatus: "aging",
        snapshotCount: 1,
      },
    });
    expect(payload?.evidence).toMatchObject({
      organizationId: "org-1",
      changedSnapshotIds: ["snap-1"],
      reviewedSnapshotIds: ["snap-1"],
    });
  });
});
