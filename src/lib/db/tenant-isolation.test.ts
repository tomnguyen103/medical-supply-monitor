import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { TestDb } from "./test-harness";

vi.mock("server-only", () => ({}));

const dbHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/db", () => ({
  get db() {
    if (!dbHolder.current) throw new Error("test db not initialized — beforeAll must run first");
    return dbHolder.current;
  },
  isDatabaseConfigured: true,
}));

import { loadLatestSnapshots } from "@/lib/alerts/engine";
import { listAlertEvents, listAlertRules } from "@/lib/alerts/queries";
import { listRiskSignals } from "@/lib/signals";

import { createTestDb } from "./test-harness";
import { alertEvents, alertRules, items, organizations, riskSignals, riskSnapshots } from "./schema";

const ORG_A = "org_a_test";
const ORG_B = "org_b_test";

let testDb: TestDb;
let closeDb: () => Promise<void>;

function requireRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one row from seed insert");
  return row;
}

beforeAll(async () => {
  const harness = await createTestDb();
  testDb = harness.db;
  closeDb = harness.close;
  dbHolder.current = testDb;

  await testDb.insert(organizations).values([
    { id: ORG_A, name: "Org A" },
    { id: ORG_B, name: "Org B" },
  ]);

  const itemA = requireRow(
    await testDb
      .insert(items)
      .values({ organizationId: ORG_A, name: "Item A" })
      .returning({ id: items.id }),
  );
  const itemB = requireRow(
    await testDb
      .insert(items)
      .values({ organizationId: ORG_B, name: "Item B" })
      .returning({ id: items.id }),
  );

  const computedAt = new Date("2026-06-01T00:00:00Z");
  await testDb.insert(riskSnapshots).values([
    {
      organizationId: ORG_A,
      itemId: itemA.id,
      scoringVersion: "test",
      riskScore: 80,
      riskLevel: "high",
      computedAt,
    },
    {
      organizationId: ORG_B,
      itemId: itemB.id,
      scoringVersion: "test",
      riskScore: 20,
      riskLevel: "low",
      computedAt,
    },
  ]);

  await testDb.insert(riskSignals).values([
    {
      organizationId: ORG_A,
      source: "test_source",
      domain: "shortage",
      entityType: "item",
      itemId: itemA.id,
      title: "Signal A",
      dedupeKey: "dedupe-signal-a",
    },
    {
      organizationId: ORG_B,
      source: "test_source",
      domain: "shortage",
      entityType: "item",
      itemId: itemB.id,
      title: "Signal B",
      dedupeKey: "dedupe-signal-b",
    },
  ]);

  const ruleA = requireRow(
    await testDb
      .insert(alertRules)
      .values({ organizationId: ORG_A, name: "Rule A" })
      .returning({ id: alertRules.id }),
  );
  await testDb.insert(alertRules).values({ organizationId: ORG_B, name: "Rule B" });

  await testDb.insert(alertEvents).values([
    {
      organizationId: ORG_A,
      ruleId: ruleA.id,
      itemId: itemA.id,
      severity: "high",
      channel: "in_app",
      title: "Alert A",
      dedupeKey: "dedupe-alert-a",
    },
    {
      organizationId: ORG_B,
      itemId: itemB.id,
      severity: "low",
      channel: "in_app",
      title: "Alert B",
      dedupeKey: "dedupe-alert-b",
    },
  ]);
});

afterAll(async () => {
  await closeDb();
});

describe("two-org tenant isolation", () => {
  it("listAlertRules only returns the calling org's rules", async () => {
    const rowsA = await listAlertRules(ORG_A);
    const rowsB = await listAlertRules(ORG_B);
    expect(rowsA.map((r) => r.name)).toEqual(["Rule A"]);
    expect(rowsB.map((r) => r.name)).toEqual(["Rule B"]);
  });

  it("listAlertEvents only returns the calling org's events", async () => {
    const rowsA = await listAlertEvents(ORG_A);
    const rowsB = await listAlertEvents(ORG_B);
    expect(rowsA.map((r) => r.title)).toEqual(["Alert A"]);
    expect(rowsB.map((r) => r.title)).toEqual(["Alert B"]);
  });

  it("listRiskSignals only returns the calling org's signals", async () => {
    const rowsA = await listRiskSignals(ORG_A);
    const rowsB = await listRiskSignals(ORG_B);
    expect(rowsA.map((r) => r.title)).toEqual(["Signal A"]);
    expect(rowsB.map((r) => r.title)).toEqual(["Signal B"]);
  });

  it("loadLatestSnapshots (engine) only returns the calling org's snapshots", async () => {
    const rowsA = await loadLatestSnapshots(ORG_A);
    const rowsB = await loadLatestSnapshots(ORG_B);
    expect(rowsA.map((r) => r.riskScore)).toEqual([80]);
    expect(rowsB.map((r) => r.riskScore)).toEqual([20]);
  });

  it("querying an org with no data returns empty, not the other org's rows", async () => {
    expect(await listAlertRules("org_nonexistent")).toEqual([]);
    expect(await listAlertEvents("org_nonexistent")).toEqual([]);
    expect(await listRiskSignals("org_nonexistent")).toEqual([]);
    expect(await loadLatestSnapshots("org_nonexistent")).toEqual([]);
  });
});
