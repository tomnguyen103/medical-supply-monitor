import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("server-only", () => ({}));

const dbHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/db", () => ({
  get db() {
    if (!dbHolder.current) throw new Error("test db not initialized — beforeAll must run first");
    return dbHolder.current;
  },
  isDatabaseConfigured: true,
}));

import type { NormalizedRiskSignal } from "@/lib/connectors/types";
import { items, organizations, riskSignals } from "@/lib/db/schema";
import type { TestDb } from "@/lib/db/test-harness";
import { createTestDb } from "@/lib/db/test-harness";
import type { SignalMatch } from "./matching";
import { reconcileResolvedSignals, upsertMatchedSignal } from "./persistence";

const ORG = "org_persistence_test";
const OTHER_SOURCE = "other_source";
const SOURCE = "test_source";

let testDb: TestDb;
let closeDb: () => Promise<void>;
let itemId: string;

function signal(dedupeKey: string, source = SOURCE): NormalizedRiskSignal {
  return {
    source,
    domain: "shortage",
    entityType: "item",
    entityId: dedupeKey,
    title: `Signal ${dedupeKey}`,
    severity: "moderate",
    lastFetchedAt: new Date("2026-06-27T12:00:00Z"),
    stalenessStatus: "fresh",
    dedupeKey,
  };
}

function match(source = SOURCE): SignalMatch {
  return {
    organizationId: ORG,
    itemId,
    reason: "keyword",
    matchedValue: "fixture",
  };
}

async function statusOf(dedupeKey: string, source = SOURCE): Promise<string | undefined> {
  const [row] = await testDb
    .select({ status: riskSignals.status })
    .from(riskSignals)
    .where(
      and(
        eq(riskSignals.organizationId, ORG),
        eq(riskSignals.source, source),
        eq(riskSignals.dedupeKey, dedupeKey),
      ),
    );
  return row?.status;
}

beforeAll(async () => {
  const harness = await createTestDb();
  testDb = harness.db;
  closeDb = harness.close;
  dbHolder.current = testDb;

  await testDb.insert(organizations).values({ id: ORG, name: "Persistence Test Org" });
  const [item] = await testDb
    .insert(items)
    .values({ organizationId: ORG, name: "Widget" })
    .returning({ id: items.id });
  if (!item) throw new Error("seed insert failed");
  itemId = item.id;
});

afterAll(async () => {
  await closeDb();
});

describe("reconcileResolvedSignals (A5a)", () => {
  it("marks a previously-active signal resolved when it's absent from the latest run", async () => {
    await upsertMatchedSignal(signal("stays-active"), match());
    await upsertMatchedSignal(signal("goes-away"), match());

    const resolvedCount = await reconcileResolvedSignals(ORG, SOURCE, ["stays-active"]);

    expect(resolvedCount).toBe(1);
    expect(await statusOf("stays-active")).toBe("active");
    expect(await statusOf("goes-away")).toBe("resolved");
  });

  it("does not touch signals from a different source", async () => {
    await upsertMatchedSignal(signal("cross-source", OTHER_SOURCE), match(OTHER_SOURCE));

    await reconcileResolvedSignals(ORG, SOURCE, []);

    expect(await statusOf("cross-source", OTHER_SOURCE)).toBe("active");
  });

  it("resolves everything for that org+source when nothing was seen this run", async () => {
    await upsertMatchedSignal(signal("empty-run-a"), match());
    await upsertMatchedSignal(signal("empty-run-b"), match());

    await reconcileResolvedSignals(ORG, SOURCE, []);

    expect(await statusOf("empty-run-a")).toBe("resolved");
    expect(await statusOf("empty-run-b")).toBe("resolved");
  });
});

describe("upsertMatchedSignal dedupe stability", () => {
  it("updates the same row in place on re-fetch instead of creating a duplicate", async () => {
    const dedupeKey = "stable-key";
    await upsertMatchedSignal(
      { ...signal(dedupeKey), severityScore: 40, title: "First revision" },
      match(),
    );
    await upsertMatchedSignal(
      { ...signal(dedupeKey), severityScore: 90, title: "Second revision" },
      match(),
    );

    const rows = await testDb
      .select()
      .from(riskSignals)
      .where(
        and(
          eq(riskSignals.organizationId, ORG),
          eq(riskSignals.source, SOURCE),
          eq(riskSignals.dedupeKey, dedupeKey),
        ),
      );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Second revision");
    expect(rows[0]?.severityScore).toBe(90);
  });
});
