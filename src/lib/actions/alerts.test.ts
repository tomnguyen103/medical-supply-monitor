import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestDb } from "@/lib/db/test-harness";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn() }));

const dbHolder = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/db", () => ({
  get db() {
    if (!dbHolder.current) throw new Error("test db not initialized — beforeAll must run first");
    return dbHolder.current;
  },
  isDatabaseConfigured: true,
}));

const { mockGetOrgContext, mockHasOrgPermission, mockEnforceRateLimit } = vi.hoisted(() => ({
  mockGetOrgContext: vi.fn(),
  mockHasOrgPermission: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
}));
vi.mock("@/lib/auth/tenancy", () => ({
  getOrgContext: mockGetOrgContext,
  hasOrgPermission: mockHasOrgPermission,
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceActionRateLimit: mockEnforceRateLimit,
}));

const { mockApprove, mockReject, mockRunEvaluation } = vi.hoisted(() => ({
  mockApprove: vi.fn(),
  mockReject: vi.fn(),
  mockRunEvaluation: vi.fn(),
}));
vi.mock("@/lib/alerts/engine", () => ({
  approveAlertEventForDelivery: mockApprove,
  rejectAlertEventForDelivery: mockReject,
  runAlertEvaluationForOrganization: mockRunEvaluation,
}));

import {
  createAlertRuleAction,
  deleteAlertRuleAction,
  approveAlertEventAction,
} from "./alerts";
import { createTestDb } from "@/lib/db/test-harness";
import { alertRules, organizations } from "@/lib/db/schema";

let testDb: TestDb;
let closeDb: () => Promise<void>;
const ORG = "org_actions_test";

beforeAll(async () => {
  const harness = await createTestDb();
  testDb = harness.db;
  closeDb = harness.close;
  dbHolder.current = testDb;
  await testDb.insert(organizations).values({ id: ORG, name: "Actions Test Org" });
});

afterAll(async () => {
  await closeDb();
});

beforeEach(() => {
  mockGetOrgContext.mockReset();
  mockHasOrgPermission.mockReset().mockReturnValue(true);
  mockEnforceRateLimit.mockReset().mockResolvedValue({ ok: true, configured: true });
  mockApprove.mockReset();
  mockReject.mockReset();
  mockRunEvaluation.mockReset();
});

function fd(entries: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(entries)) formData.set(key, value);
  return formData;
}

describe("guard failures return a typed outcome, never void or a throw", () => {
  it("returns ok:false when no org context is active", async () => {
    mockGetOrgContext.mockResolvedValue(null);

    const result = await createAlertRuleAction(fd({ name: "Test rule" }));

    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });

  it("returns ok:false when the org role lacks permission", async () => {
    mockGetOrgContext.mockResolvedValue({ orgId: ORG, userId: "u1", orgRole: "org:viewer", orgSlug: null });
    mockHasOrgPermission.mockReturnValue(false);

    const result = await createAlertRuleAction(fd({ name: "Test rule" }));

    expect(result.ok).toBe(false);
  });

  it("returns ok:false when rate limited", async () => {
    mockGetOrgContext.mockResolvedValue({ orgId: ORG, userId: "u1", orgRole: "org:admin", orgSlug: null });
    mockEnforceRateLimit.mockResolvedValue({ ok: false, configured: true, error: "Too many requests." });

    const result = await createAlertRuleAction(fd({ name: "Test rule" }));

    expect(result).toEqual({ ok: false, message: "Too many requests." });
  });

  it("returns ok:false for an empty rule name instead of silently no-op'ing", async () => {
    mockGetOrgContext.mockResolvedValue({ orgId: ORG, userId: "u1", orgRole: "org:admin", orgSlug: null });

    const result = await createAlertRuleAction(fd({ name: "  " }));

    expect(result.ok).toBe(false);
  });

  it("returns ok:false when deleting a rule that doesn't exist, instead of silently no-op'ing", async () => {
    mockGetOrgContext.mockResolvedValue({ orgId: ORG, userId: "u1", orgRole: "org:admin", orgSlug: null });

    const result = await deleteAlertRuleAction("00000000-0000-0000-0000-000000000000");

    expect(result).toEqual({ ok: false, message: "Alert rule not found." });
  });
});

describe("success paths return a typed ok:true outcome", () => {
  beforeEach(() => {
    mockGetOrgContext.mockResolvedValue({ orgId: ORG, userId: "u1", orgRole: "org:admin", orgSlug: null });
  });

  it("creates a rule and persists it", async () => {
    const result = await createAlertRuleAction(fd({ name: "Critical shortages" }));

    expect(result.ok).toBe(true);
    const rows = await testDb.select().from(alertRules).where(eq(alertRules.organizationId, ORG));
    expect(rows.map((r) => r.name)).toContain("Critical shortages");
  });

  it("maps a successful approval onto the typed outcome", async () => {
    mockApprove.mockResolvedValue({ ok: true, status: "approved", deliveryStatus: "sent" });

    const result = await approveAlertEventAction("event-1");

    expect(result).toEqual({ ok: true, message: "Alert approved and delivered." });
  });

  it("maps a not-found approval onto a typed failure, not a throw", async () => {
    mockApprove.mockResolvedValue({ ok: false, reason: "not-found" });

    const result = await approveAlertEventAction("event-missing");

    expect(result).toEqual({ ok: false, message: "Alert event not found." });
  });
});
