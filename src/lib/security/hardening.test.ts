import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { hasOrgPermission } from "@/lib/auth/tenancy";
import { sanitizeAuditMetadata } from "@/lib/audit";
import { resolveRetentionPolicy } from "@/lib/retention";

describe("RBAC permissions", () => {
  it("allows operators to manage catalog and alerts but not settings", () => {
    const member = { orgRole: "org:member" };

    expect(hasOrgPermission(member, "view")).toBe(true);
    expect(hasOrgPermission(member, "manage_catalog")).toBe(true);
    expect(hasOrgPermission(member, "manage_alerts")).toBe(true);
    expect(hasOrgPermission(member, "manage_settings")).toBe(false);
  });

  it("limits viewer roles to read-only access", () => {
    const viewer = { orgRole: "org:viewer" };

    expect(hasOrgPermission(viewer, "view")).toBe(true);
    expect(hasOrgPermission(viewer, "manage_catalog")).toBe(false);
  });
});

describe("audit metadata safety", () => {
  it("redacts secrets and direct contact identifiers", () => {
    expect(
      sanitizeAuditMetadata({
        token: "secret",
        api_key: "secret",
        note: "Contact jane@example.com at 512-555-1212.",
        nested: { rawPayload: { anything: true } },
      }),
    ).toEqual({
      token: "[redacted]",
      api_key: "[redacted]",
      note: "Contact [redacted-email] at [redacted-phone].",
      nested: { rawPayload: "[redacted]" },
    });
  });
});

describe("retention policy", () => {
  it("uses defaults and clamps tenant overrides", () => {
    expect(
      resolveRetentionPolicy({
        retention: {
          riskSignalDays: 5,
          auditLogDays: 9999,
          agentRunDays: "90",
        },
      }),
    ).toMatchObject({
      riskSignalDays: 365,
      auditLogDays: 2555,
      agentRunDays: 90,
    });
  });

  it("keeps parent risk records at least as long as linked evidence", () => {
    expect(
      resolveRetentionPolicy({
        retention: {
          riskSignalDays: 90,
          riskSnapshotDays: 120,
          evidenceDays: 400,
        },
      }),
    ).toMatchObject({
      riskSignalDays: 400,
      riskSnapshotDays: 400,
      evidenceDays: 400,
    });
  });
});
