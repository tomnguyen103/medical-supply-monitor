import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dbHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/db", () => ({
  get db() {
    if (!dbHolder.current) throw new Error("test db not initialized — beforeAll must run first");
    return dbHolder.current;
  },
  isDatabaseConfigured: true,
}));

import { inventorySnapshots, items, organizations } from "@/lib/db/schema";
import type { TestDb } from "@/lib/db/test-harness";
import { createTestDb } from "@/lib/db/test-harness";
import {
  INVENTORY_FRESHNESS_WINDOW_DAYS,
  isInventoryFresh,
  loadTenantScoreInputs,
} from "./snapshots";

describe("isInventoryFresh (A23)", () => {
  const scoringAsOf = new Date("2026-06-27T12:00:00.000Z");

  it("treats inventory inside the window as fresh", () => {
    const inventoryAsOf = new Date(
      scoringAsOf.getTime() - (INVENTORY_FRESHNESS_WINDOW_DAYS - 1) * 24 * 60 * 60 * 1000,
    );
    expect(isInventoryFresh(inventoryAsOf, scoringAsOf)).toBe(true);
  });

  it("treats inventory exactly at the window boundary as fresh", () => {
    const inventoryAsOf = new Date(
      scoringAsOf.getTime() - INVENTORY_FRESHNESS_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(isInventoryFresh(inventoryAsOf, scoringAsOf)).toBe(true);
  });

  it("treats inventory one day past the window as stale", () => {
    const inventoryAsOf = new Date(
      scoringAsOf.getTime() - (INVENTORY_FRESHNESS_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000,
    );
    expect(isInventoryFresh(inventoryAsOf, scoringAsOf)).toBe(false);
  });
});

describe("loadTenantScoreInputs stale inventory exclusion (A23)", () => {
  const ORG_STALE = "org_stale_inventory";
  const ORG_FRESH = "org_fresh_inventory";
  const asOf = new Date("2026-06-27T12:00:00.000Z");

  let testDb: TestDb;
  let closeDb: () => Promise<void>;

  beforeAll(async () => {
    const harness = await createTestDb();
    testDb = harness.db;
    closeDb = harness.close;
    dbHolder.current = testDb;

    await testDb.insert(organizations).values([
      { id: ORG_STALE, name: "Stale Inventory Org" },
      { id: ORG_FRESH, name: "Fresh Inventory Org" },
    ]);

    const [staleItem] = await testDb
      .insert(items)
      .values({ organizationId: ORG_STALE, name: "Stale Widget" })
      .returning({ id: items.id });
    const [freshItem] = await testDb
      .insert(items)
      .values({ organizationId: ORG_FRESH, name: "Fresh Widget" })
      .returning({ id: items.id });
    if (!staleItem || !freshItem) throw new Error("seed insert failed");

    const staleAsOf = new Date(
      asOf.getTime() - (INVENTORY_FRESHNESS_WINDOW_DAYS + 15) * 24 * 60 * 60 * 1000,
    );
    const freshAsOf = new Date(asOf.getTime() - 5 * 24 * 60 * 60 * 1000);

    await testDb.insert(inventorySnapshots).values([
      {
        organizationId: ORG_STALE,
        itemId: staleItem.id,
        daysOnHand: 5,
        asOf: staleAsOf,
      },
      {
        organizationId: ORG_FRESH,
        itemId: freshItem.id,
        daysOnHand: 12,
        asOf: freshAsOf,
      },
    ]);
  });

  afterAll(async () => {
    await closeDb();
  });

  it("does not use a stale inventory row's daysOnHand for scoring", async () => {
    const [input] = await loadTenantScoreInputs(ORG_STALE, asOf);
    expect(input?.daysOnHand).toBeNull();
  });

  it("uses a fresh inventory row's daysOnHand for scoring", async () => {
    const [input] = await loadTenantScoreInputs(ORG_FRESH, asOf);
    expect(input?.daysOnHand).toBe(12);
  });
});
