import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  aiWorkflowTotallyFailed,
  alertsTotallyFailed,
  ingestionTotallyFailed,
  scoringTotallyFailed,
} from "./functions";

describe("Inngest pipeline threshold gates (A4)", () => {
  describe("ingestionTotallyFailed", () => {
    it("is false when at least one connector succeeded", () => {
      expect(
        ingestionTotallyFailed({
          ok: false,
          tenants: 1,
          fetched: 5,
          matched: 2,
          persisted: 2,
          failed: 3,
          connectors: [
            { connectorId: "a", fetched: 5, matched: 2, persisted: 2, failed: 3, error: "boom" },
            { connectorId: "b", fetched: 5, matched: 5, persisted: 5, failed: 0 },
          ],
        }),
      ).toBe(false);
    });

    it("is true when every connector errored", () => {
      expect(
        ingestionTotallyFailed({
          ok: false,
          tenants: 1,
          fetched: 0,
          matched: 0,
          persisted: 0,
          failed: 0,
          connectors: [
            { connectorId: "a", fetched: 0, matched: 0, persisted: 0, failed: 0, error: "boom" },
            { connectorId: "b", fetched: 0, matched: 0, persisted: 0, failed: 0, error: "boom" },
          ],
        }),
      ).toBe(true);
    });

    it("is false for a graceful skip (not configured / no connectors)", () => {
      expect(
        ingestionTotallyFailed({
          ok: false,
          skipped: "database-unconfigured",
          tenants: 0,
          fetched: 0,
          matched: 0,
          persisted: 0,
          failed: 0,
          connectors: [],
        }),
      ).toBe(false);
    });
  });

  describe("scoringTotallyFailed", () => {
    it("is false when some items scored successfully", () => {
      expect(
        scoringTotallyFailed({ ok: false, tenants: 2, items: 10, snapshots: 8, changed: 3, failed: 2 }),
      ).toBe(false);
    });

    it("is true when every considered item failed", () => {
      expect(
        scoringTotallyFailed({ ok: false, tenants: 2, items: 5, snapshots: 0, changed: 0, failed: 5 }),
      ).toBe(true);
    });

    it("is false when there was simply nothing to score (e.g. a freshly onboarded org with an empty catalog) — not a failure", () => {
      expect(
        scoringTotallyFailed({ ok: true, tenants: 2, items: 0, snapshots: 0, changed: 0, failed: 0 }),
      ).toBe(false);
    });

    it("is false for a graceful skip", () => {
      expect(
        scoringTotallyFailed({
          ok: false,
          skipped: "database-unconfigured",
          tenants: 0,
          items: 0,
          snapshots: 0,
          changed: 0,
          failed: 0,
        }),
      ).toBe(false);
    });
  });

  describe("alertsTotallyFailed", () => {
    it("is false when only some orgs crashed (the whole point of A7's isolation fix)", () => {
      expect(
        alertsTotallyFailed({
          ok: false,
          tenants: 10,
          rules: 5,
          events: 5,
          briefs: 5,
          sent: 3,
          suppressed: 1,
          awaitingApproval: 0,
          failed: 1,
          tenantsFailed: 1,
        }),
      ).toBe(false);
    });

    it("is true when every org's evaluation crashed", () => {
      expect(
        alertsTotallyFailed({
          ok: false,
          tenants: 3,
          rules: 0,
          events: 0,
          briefs: 0,
          sent: 0,
          suppressed: 0,
          awaitingApproval: 0,
          failed: 0,
          tenantsFailed: 3,
        }),
      ).toBe(true);
    });

    it("is false for a graceful skip", () => {
      expect(
        alertsTotallyFailed({
          ok: false,
          skipped: "database-unconfigured",
          tenants: 0,
          rules: 0,
          events: 0,
          briefs: 0,
          sent: 0,
          suppressed: 0,
          awaitingApproval: 0,
          failed: 0,
          tenantsFailed: 0,
        }),
      ).toBe(false);
    });
  });

  describe("aiWorkflowTotallyFailed", () => {
    it("is false when some orgs' workflows completed", () => {
      expect(
        aiWorkflowTotallyFailed({ ok: false, tenants: 4, runs: 3, blocked: 0, awaitingApproval: 0, failed: 1 }),
      ).toBe(false);
    });

    it("is true when every org's workflow crashed", () => {
      expect(
        aiWorkflowTotallyFailed({ ok: false, tenants: 2, runs: 0, blocked: 0, awaitingApproval: 0, failed: 2 }),
      ).toBe(true);
    });
  });
});
