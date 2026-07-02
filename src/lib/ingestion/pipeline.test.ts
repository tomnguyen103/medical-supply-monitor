import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const persistenceMockState = vi.hoisted(() => ({ failDedupeKey: null as string | null }));

vi.mock("./persistence", async () => {
  const actual = await vi.importActual<typeof import("./persistence")>("./persistence");
  return {
    ...actual,
    upsertMatchedSignal: vi.fn(async (signal: { dedupeKey: string }, match: unknown) => {
      if (signal.dedupeKey === persistenceMockState.failDedupeKey) {
        throw new Error("simulated transient write failure");
      }
      return actual.upsertMatchedSignal(
        signal as Parameters<typeof actual.upsertMatchedSignal>[0],
        match as Parameters<typeof actual.upsertMatchedSignal>[1],
      );
    }),
  };
});

import type { NormalizedRiskSignal } from "@/lib/connectors/types";
import { items, organizations, riskSignals } from "@/lib/db/schema";
import type { TestDb } from "@/lib/db/test-harness";
import { createTestDb } from "@/lib/db/test-harness";
import { persistSignalsForTenants } from "./pipeline";

const ORG = "org_pipeline_test";
const SOURCE = "test_source";

let testDb: TestDb;
let closeDb: () => Promise<void>;

function widgetSignal(dedupeKey: string): NormalizedRiskSignal {
  return {
    source: SOURCE,
    domain: "shortage",
    entityType: "item",
    entityId: dedupeKey,
    title: "Widget shortage",
    severity: "moderate",
    lastFetchedAt: new Date("2026-06-27T12:00:00Z"),
    stalenessStatus: "fresh",
    dedupeKey,
  };
}

async function statusOf(dedupeKey: string): Promise<string | undefined> {
  const [row] = await testDb
    .select({ status: riskSignals.status })
    .from(riskSignals)
    .where(
      and(
        eq(riskSignals.organizationId, ORG),
        eq(riskSignals.source, SOURCE),
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

  await testDb.insert(organizations).values({ id: ORG, name: "Pipeline Test Org" });
  await testDb.insert(items).values({ organizationId: ORG, name: "Widget" });
});

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  persistenceMockState.failDedupeKey = null;
});

describe("persistSignalsForTenants reconciliation wiring (A5a)", () => {
  it("keeps a matched signal that failed to persist marked as seen, not resolved", async () => {
    const first = await persistSignalsForTenants(
      SOURCE,
      [widgetSignal("key-a"), widgetSignal("key-c")],
      [ORG],
      25,
    );
    expect(first).toMatchObject({ matched: 2, persisted: 2, failed: 0 });
    expect(await statusOf("key-a")).toBe("active");
    expect(await statusOf("key-c")).toBe("active");

    // Second run: the source still reports both signals, but key-c's write
    // fails transiently this run.
    persistenceMockState.failDedupeKey = "key-c";
    const second = await persistSignalsForTenants(
      SOURCE,
      [widgetSignal("key-a"), widgetSignal("key-c")],
      [ORG],
      25,
    );

    expect(second).toMatchObject({ matched: 2, persisted: 1, failed: 1, resolved: 0 });
    expect(await statusOf("key-a")).toBe("active");
    // key-c must still read "active" from run 1 - a transient write failure
    // must never be conflated with "the source stopped reporting this".
    expect(await statusOf("key-c")).toBe("active");
  });

  it("resolves a matched signal genuinely absent from the latest fetch", async () => {
    await persistSignalsForTenants(
      SOURCE,
      [widgetSignal("key-present"), widgetSignal("key-gone")],
      [ORG],
      25,
    );
    expect(await statusOf("key-gone")).toBe("active");

    const result = await persistSignalsForTenants(
      SOURCE,
      [widgetSignal("key-present")],
      [ORG],
      25,
    );

    expect(result.resolved).toBe(1);
    expect(await statusOf("key-present")).toBe("active");
    expect(await statusOf("key-gone")).toBe("resolved");
  });
});
