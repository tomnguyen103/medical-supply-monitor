import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mockEnv = vi.hoisted(() => ({
  app: { isProduction: false },
  notifications: {
    resendApiKey: undefined as string | undefined,
    slackWebhookUrl: undefined as string | undefined,
    alertFromEmail: undefined as string | undefined,
    alertToEmail: undefined as string | undefined,
  },
}));

const mockIntegrations = vi.hoisted(() => ({
  resend: false,
}));

vi.mock("@/lib/env", () => ({
  env: mockEnv,
  integrations: mockIntegrations,
}));

import { deliverAlert } from "./delivery";

function abortableFetchMock() {
  return vi.fn((_url: string, init: RequestInit) => {
    return new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        const err = new Error("aborted");
        err.name = "AbortError";
        reject(err);
      });
    });
  });
}

beforeEach(() => {
  mockEnv.app.isProduction = false;
  mockEnv.notifications.resendApiKey = undefined;
  mockEnv.notifications.slackWebhookUrl = undefined;
  mockEnv.notifications.alertFromEmail = undefined;
  mockEnv.notifications.alertToEmail = undefined;
  mockIntegrations.resend = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("deliverAlert — Slack", () => {
  it("uses the org's webhook when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverAlert({
      channel: "slack",
      title: "t",
      body: "b",
      target: { slackWebhookUrl: "https://hooks.slack.com/org" },
    });

    expect(result).toEqual({ status: "sent" });
    expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/org", expect.anything());
  });

  it("falls back to the env webhook outside production when no org target is set", async () => {
    mockEnv.notifications.slackWebhookUrl = "https://hooks.slack.com/env";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverAlert({ channel: "slack", title: "t", body: "b" });

    expect(result).toEqual({ status: "sent" });
    expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/env", expect.anything());
  });

  it("does not fall back to the env webhook in production", async () => {
    mockEnv.app.isProduction = true;
    mockEnv.notifications.slackWebhookUrl = "https://hooks.slack.com/env";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverAlert({ channel: "slack", title: "t", body: "b" });

    expect(result).toEqual({ status: "suppressed", error: "Slack webhook is not configured." });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("prefers the org target over the env webhook even outside production", async () => {
    mockEnv.notifications.slackWebhookUrl = "https://hooks.slack.com/env";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await deliverAlert({
      channel: "slack",
      title: "t",
      body: "b",
      target: { slackWebhookUrl: "https://hooks.slack.com/org" },
    });

    expect(fetchMock).toHaveBeenCalledWith("https://hooks.slack.com/org", expect.anything());
  });

  it("aborts after 10s and reports a timeout instead of hanging", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", abortableFetchMock());

    const promise = deliverAlert({
      channel: "slack",
      title: "t",
      body: "b",
      target: { slackWebhookUrl: "https://hooks.slack.com/org" },
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await promise;

    expect(result).toEqual({ status: "failed", error: "Slack delivery timed out." });
  });

  it("reports a failed status (not a thrown error) on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const result = await deliverAlert({
      channel: "slack",
      title: "t",
      body: "b",
      target: { slackWebhookUrl: "https://hooks.slack.com/org" },
    });

    expect(result).toEqual({ status: "failed", error: "Slack delivery failed with 500." });
  });
});

describe("deliverAlert — Email", () => {
  beforeEach(() => {
    mockIntegrations.resend = true;
    mockEnv.notifications.resendApiKey = "re_test";
    mockEnv.notifications.alertFromEmail = "alerts@example.com";
  });

  it("uses the org's alert email when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverAlert({
      channel: "email",
      title: "t",
      body: "b",
      target: { alertEmail: "org-lead@example.com" },
    });

    expect(result).toEqual({ status: "sent" });
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error("expected fetch to have been called");
    const init = call[1] as RequestInit;
    const payload = JSON.parse(init.body as string);
    expect(payload.to).toEqual(["org-lead@example.com"]);
  });

  it("does not fall back to the env recipient in production", async () => {
    mockEnv.app.isProduction = true;
    mockEnv.notifications.alertToEmail = "global@example.com";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await deliverAlert({ channel: "email", title: "t", body: "b" });

    expect(result.status).toBe("suppressed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
