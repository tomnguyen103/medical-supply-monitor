import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { TestDb } from "@/lib/db/test-harness";

vi.mock("server-only", () => ({}));

const dbHolder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/lib/db", () => ({
  get db() {
    if (!dbHolder.current) throw new Error("test db not initialized — beforeAll must run first");
    return dbHolder.current;
  },
  isDatabaseConfigured: true,
}));

const { mockAuth, mockGetOrganization } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetOrganization: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
  clerkClient: async () => ({
    organizations: { getOrganization: (params: unknown) => mockGetOrganization(params) },
  }),
}));

vi.mock("@/lib/env", () => ({
  integrations: { clerk: true },
}));

import { getOrgContext } from "@/lib/auth/tenancy";
import { createTestDb } from "@/lib/db/test-harness";
import { organizations } from "@/lib/db/schema";

let testDb: TestDb;
let closeDb: () => Promise<void>;

beforeAll(async () => {
  const harness = await createTestDb();
  testDb = harness.db;
  closeDb = harness.close;
  dbHolder.current = testDb;
});

afterAll(async () => {
  await closeDb();
});

afterEach(() => {
  vi.clearAllMocks();
});

async function fetchOrgRow(orgId: string) {
  const rows = await testDb.select().from(organizations).where(eq(organizations.id, orgId));
  return rows[0] ?? null;
}

describe("getOrgContext lazy org upsert", () => {
  it("creates the organizations row on first authenticated hit, using Clerk's org name", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_1",
      orgId: "org_new_1",
      orgRole: "org:admin",
      orgSlug: "new-co",
    });
    mockGetOrganization.mockResolvedValue({ name: "New Co", slug: "new-co" });

    const ctx = await getOrgContext();

    expect(ctx).toEqual({
      userId: "user_1",
      orgId: "org_new_1",
      orgRole: "org:admin",
      orgSlug: "new-co",
    });
    const row = await fetchOrgRow("org_new_1");
    expect(row?.name).toBe("New Co");
    expect(row?.slug).toBe("new-co");
  });

  it("does not re-insert or re-call Clerk once the row already exists", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_2",
      orgId: "org_new_1",
      orgRole: "org:member",
      orgSlug: "new-co",
    });

    await getOrgContext();

    expect(mockGetOrganization).not.toHaveBeenCalled();
    const rows = await testDb
      .select()
      .from(organizations)
      .where(eq(organizations.id, "org_new_1"));
    expect(rows).toHaveLength(1);
  });

  it("falls back to the slug as name when the Clerk API call fails, without throwing", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_3",
      orgId: "org_new_2",
      orgRole: null,
      orgSlug: "fallback-co",
    });
    mockGetOrganization.mockRejectedValue(new Error("Clerk API down"));

    const ctx = await getOrgContext();

    expect(ctx?.orgId).toBe("org_new_2");
    const row = await fetchOrgRow("org_new_2");
    expect(row?.name).toBe("fallback-co");
  });

  it("returns null and never touches the database when there is no active org", async () => {
    mockAuth.mockResolvedValue({
      userId: "user_4",
      orgId: null,
      orgRole: null,
      orgSlug: null,
    });

    const ctx = await getOrgContext();

    expect(ctx).toBeNull();
    expect(mockGetOrganization).not.toHaveBeenCalled();
  });
});
