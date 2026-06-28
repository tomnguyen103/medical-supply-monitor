import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    env: {
      ...actual.env,
      ai: {
        ...actual.env.ai,
        provider: undefined,
        openaiApiKey: undefined,
        openaiModel: undefined,
        geminiApiKey: undefined,
        geminiModel: undefined,
        localLlmBaseUrl: undefined,
        localLlmModel: undefined,
      },
    },
    integrations: {
      ...actual.integrations,
      ai: false,
      openai: false,
      gemini: false,
      localLlm: false,
      database: false,
      langsmith: false,
    },
  };
});

import type { AiWorkflowSnapshot } from "@/lib/ai/graph";
import {
  buildImportMappingSuggestions,
  runDailyBriefWorkflow,
} from "@/lib/ai/graph";
import {
  assessCompliance,
  redactSensitiveText,
  sanitizeTracePayload,
} from "@/lib/ai/safety";

const snapshot: AiWorkflowSnapshot = {
  id: "snap-1",
  itemId: "item-1",
  itemName: "Sterile saline",
  scoringVersion: "v0.2.0",
  riskScore: 84,
  riskLevel: "critical",
  confidence: 0.82,
  stalenessStatus: "fresh",
  computedAt: new Date("2026-06-27T12:00:00.000Z"),
  components: [
    {
      factor: "signal_shortage",
      weight: 1,
      rawValue: 92,
      contribution: 62,
      explanation: "Shortage signal after freshness decay.",
      signalIds: ["sig-1"],
    },
  ],
  inputs: {
    signals: [
      {
        id: "sig-1",
        domain: "shortage",
        stalenessStatus: "fresh",
      },
    ],
  },
  changeSummary: {
    changed: true,
    deltaScore: 13,
  },
};

describe("AI workflow safety", () => {
  it("blocks PHI and clinical recommendation language", () => {
    const report = assessCompliance([
      "MRN 123456 should receive treatment and an alternative medication.",
    ]);

    expect(report.blocked).toBe(true);
    expect(report.violations.map((violation) => violation.category)).toEqual(
      expect.arrayContaining(["phi", "diagnosis_or_treatment", "drug_substitution"]),
    );
  });

  it("blocks contact and date-of-birth identifiers before redaction paths", () => {
    const report = assessCompliance(["Email, phone number, and DOB columns detected."]);

    expect(report.blocked).toBe(true);
    expect(report.violations.map((violation) => violation.pattern)).toEqual(
      expect.arrayContaining(["email address", "phone number or header", "date of birth"]),
    );
  });

  it("redacts common sensitive values before trace or error storage", () => {
    expect(
      redactSensitiveText("Contact jane@example.com for MRN 123456 and 123-45-6789."),
    ).toBe(
      "Contact [redacted-email] for [redacted-patient-identifier] and [redacted-ssn].",
    );
  });

  it("removes sensitive keys from trace payloads", () => {
    expect(
      sanitizeTracePayload({
        itemId: "item-1",
        rawPayload: { secret: "abc" },
        nested: { token: "secret-token", note: "safe" },
      }),
    ).toEqual({
      itemId: "item-1",
      rawPayload: "[redacted]",
      nested: { token: "[redacted]", note: "safe" },
    });
  });
});

describe("AI workflow graph", () => {
  it("runs with deterministic fallback when no AI provider is configured", async () => {
    const result = await runDailyBriefWorkflow({
      organizationId: "org-test",
      asOf: "2026-06-27T12:00:00.000Z",
      snapshots: [snapshot],
      importHeaders: ["Item Name", "NDC", "Supplier Name"],
    });

    expect(result.runId).toBeNull();
    expect(result.status).toBe("awaiting_human_approval");
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.compliance.blocked).toBe(false);
    expect(result.draft).toContain("Sterile saline");
    expect(result.scoreSummary).toMatchObject({
      criticalCount: 1,
      changedCount: 1,
    });
    expect(result.importMapping).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceHeader: "NDC", targetField: "ndc" }),
        expect.objectContaining({
          sourceHeader: "Supplier Name",
          targetField: "supplierName",
        }),
      ]),
    );
  });

  it("blocks patient-level import mapping drafts", async () => {
    const result = await runDailyBriefWorkflow({
      organizationId: "org-test",
      asOf: "2026-06-27T12:00:00.000Z",
      snapshots: [snapshot],
      importHeaders: ["Patient MRN", "Item Name"],
    });

    expect(result.status).toBe("blocked");
    expect(result.draft).toBeNull();
    expect(result.importMapping[0]?.sourceHeader).toBe("[redacted-patient-identifier]");
    expect(result.compliance.violations.map((violation) => violation.category)).toContain(
      "phi",
    );
  });

  it("drafts deterministic CSV header mapping suggestions", () => {
    expect(buildImportMappingSuggestions(["GTIN", "Unknown extra"])).toEqual([
      expect.objectContaining({ sourceHeader: "GTIN", targetField: "gtin" }),
      expect.objectContaining({ sourceHeader: "Unknown extra", targetField: null }),
    ]);
  });
});
