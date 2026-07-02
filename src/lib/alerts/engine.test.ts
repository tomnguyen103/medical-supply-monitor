import { and, eq, isNotNull } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PGlite } from "@electric-sql/pglite";
import type { TestDb } from "@/lib/db/test-harness";

vi.mock("server-only", () => ({}));

const dbHolder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/db", () => ({
  get db() {
    if (!dbHolder.current) throw new Error("test db not initialized — call useTenantDb() first");
    return dbHolder.current;
  },
  isDatabaseConfigured: true,
}));

const { mockDeliverAlert } = vi.hoisted(() => ({ mockDeliverAlert: vi.fn() }));
vi.mock("@/lib/alerts/delivery", () => ({
  deliverAlert: mockDeliverAlert,
}));

const redisStore = vi.hoisted(() => ({ current: new Map<string, string>() }));
vi.mock("@/lib/redis", () => ({
  tryGetRedis: () => ({
    get: async (key: string) => redisStore.current.get(key) ?? null,
    set: async (key: string, value: string) => {
      redisStore.current.set(key, value);
      return "OK";
    },
  }),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { runAlertEvaluation, runAlertEvaluationForOrganization } from "./engine";
import { createTestDb } from "@/lib/db/test-harness";
import { alertEvents, alertRules, items, organizations, riskSnapshots } from "@/lib/db/schema";

async function useTenantDb() {
  const harness = await createTestDb();
  dbHolder.current = harness.db;
  return harness;
}

function requireRow<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("expected at least one row from seed insert");
  return row;
}

async function seedOrgWithSnapshot(db: TestDb, orgId: string, riskScore: number) {
  await db.insert(organizations).values({ id: orgId, name: orgId });
  const item = requireRow(
    await db
      .insert(items)
      .values({ organizationId: orgId, name: `${orgId} item` })
      .returning({ id: items.id }),
  );
  await db.insert(riskSnapshots).values({
    organizationId: orgId,
    itemId: item.id,
    scoringVersion: "test",
    riskScore,
    riskLevel: "high",
    computedAt: new Date("2026-06-01T00:00:00Z"),
  });
  const rule = requireRow(
    await db
      .insert(alertRules)
      .values({
        organizationId: orgId,
        name: `${orgId} rule`,
        minSeverity: "info",
        channels: ["slack"],
        cooldownMinutes: 60,
      })
      .returning({ id: alertRules.id }),
  );
  return { itemId: item.id, ruleId: rule.id };
}

beforeEach(() => {
  redisStore.current.clear();
  mockDeliverAlert.mockReset();
});

afterEach(() => {
  dbHolder.current = null;
});

describe("cooldown is reserved only after a confirmed send", () => {
  let harness: Awaited<ReturnType<typeof useTenantDb>>;

  afterEach(async () => {
    await harness.close();
  });

  it("does not start the cooldown when delivery fails", async () => {
    harness = await useTenantDb();
    await seedOrgWithSnapshot(harness.db, "org_cooldown_fail", 90);
    mockDeliverAlert.mockResolvedValue({ status: "failed", error: "simulated failure" });

    const result = await runAlertEvaluationForOrganization("org_cooldown_fail");

    expect(result.failed).toBe(1);
    expect(redisStore.current.size).toBe(0);
  });

  it("starts the cooldown after a confirmed send", async () => {
    harness = await useTenantDb();
    await seedOrgWithSnapshot(harness.db, "org_cooldown_sent", 90);
    mockDeliverAlert.mockResolvedValue({ status: "sent" });

    await runAlertEvaluationForOrganization("org_cooldown_sent");

    const ruleAlertRows = await harness.db
      .select()
      .from(alertEvents)
      .where(and(eq(alertEvents.organizationId, "org_cooldown_sent"), isNotNull(alertEvents.ruleId)));
    expect(ruleAlertRows[0]?.status).toBe("sent");
    // Only the rule-alert path reserves a cooldown — the daily brief (also
    // "sent" in this run) has no cooldown concept at all.
    expect(redisStore.current.size).toBe(1);
  });
});

describe("a failed alert event is retried on the next evaluation pass", () => {
  it("resends and marks the same event row sent, without duplicating it", async () => {
    const harness = await useTenantDb();
    try {
      await seedOrgWithSnapshot(harness.db, "org_retry", 90);

      mockDeliverAlert.mockResolvedValueOnce({ status: "failed", error: "simulated failure" });
      const first = await runAlertEvaluationForOrganization("org_retry");
      expect(first.failed).toBe(1);

      mockDeliverAlert.mockResolvedValueOnce({ status: "sent" });
      const second = await runAlertEvaluationForOrganization("org_retry");
      expect(second.sent).toBe(1);

      const ruleAlertRows = await harness.db
        .select()
        .from(alertEvents)
        .where(and(eq(alertEvents.organizationId, "org_retry"), isNotNull(alertEvents.ruleId)));

      expect(ruleAlertRows).toHaveLength(1);
      expect(ruleAlertRows[0]?.status).toBe("sent");
    } finally {
      await harness.close();
    }
  });
});

describe("per-org isolation (A7)", () => {
  it("one org's evaluation throwing does not prevent the other org's from completing", async () => {
    const harness = await useTenantDb();
    try {
      await seedOrgWithSnapshot(harness.db, "org_iso_a", 90);
      await seedOrgWithSnapshot(harness.db, "org_iso_b", 85);
      mockDeliverAlert.mockResolvedValue({ status: "sent" });

      const client: PGlite = harness.client;
      const originalQuery = client.query.bind(client);
      let injected = false;
      // Fail the first alert_rules SELECT (whichever org happens to run
      // first — for-loop order isn't contractually specified) so the test
      // proves isolation without depending on which org "wins".
      client.query = ((...args: Parameters<typeof originalQuery>) => {
        const [text] = args;
        if (!injected && /select/i.test(text) && text.includes("alert_rules")) {
          injected = true;
          return Promise.reject(new Error("simulated per-org DB failure"));
        }
        return originalQuery(...args);
      }) as typeof client.query;

      const result = await runAlertEvaluation();
      client.query = originalQuery;

      expect(result.tenants).toBe(2);
      expect(result.tenantsFailed).toBe(1);
      // The other org still produced its daily brief + rule alert.
      expect(result.events).toBeGreaterThan(0);
      expect(result.sent).toBeGreaterThan(0);
    } finally {
      await harness.close();
    }
  });
});
