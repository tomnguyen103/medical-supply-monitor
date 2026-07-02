import "server-only";

import type { AlertChannel } from "@/lib/alerts/types";
import { env, integrations } from "@/lib/env";

export type DeliveryStatus = "sent" | "suppressed" | "failed";

/** Per-org delivery targets. Falls back to global env vars, but only
 * outside production — see resolveSlackWebhook/resolveAlertToEmail below. */
export interface DeliveryTarget {
  slackWebhookUrl?: string | null;
  alertEmail?: string | null;
}

export interface DeliveryInput {
  channel: AlertChannel;
  title: string;
  body: string;
  target?: DeliveryTarget;
}

export interface DeliveryResult {
  status: DeliveryStatus;
  error?: string;
}

const DELIVERY_TIMEOUT_MS = 10_000;

export async function deliverAlert(input: DeliveryInput): Promise<DeliveryResult> {
  if (input.channel === "in_app") return { status: "sent" };
  if (input.channel === "slack") return deliverSlack(input);
  if (input.channel === "email") return deliverEmail(input);
  return {
    status: "suppressed",
    error: `${input.channel} delivery is not implemented yet.`,
  };
}

function resolveSlackWebhook(target?: DeliveryTarget): string | undefined {
  if (target?.slackWebhookUrl) return target.slackWebhookUrl;
  return env.app.isProduction ? undefined : env.notifications.slackWebhookUrl;
}

function resolveAlertToEmail(target?: DeliveryTarget): string | undefined {
  if (target?.alertEmail) return target.alertEmail;
  return env.app.isProduction ? undefined : env.notifications.alertToEmail;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function deliverSlack(input: DeliveryInput): Promise<DeliveryResult> {
  const webhookUrl = resolveSlackWebhook(input.target);
  if (!webhookUrl) {
    return { status: "suppressed", error: "Slack webhook is not configured." };
  }

  try {
    const response = await fetchWithTimeout(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: `${input.title}\n${input.body}`,
      }),
    });

    if (!response.ok) {
      return {
        status: "failed",
        error: `Slack delivery failed with ${response.status}.`,
      };
    }
    return { status: "sent" };
  } catch (error) {
    return {
      status: "failed",
      error: isAbortError(error)
        ? "Slack delivery timed out."
        : "Slack delivery failed before receiving a response.",
    };
  }
}

async function deliverEmail(input: DeliveryInput): Promise<DeliveryResult> {
  if (!integrations.resend || !env.notifications.resendApiKey) {
    return { status: "suppressed", error: "Resend is not configured." };
  }
  const toEmail = resolveAlertToEmail(input.target);
  if (!env.notifications.alertFromEmail || !toEmail) {
    return {
      status: "suppressed",
      error: "Alert email sender or recipient is not configured.",
    };
  }

  try {
    const response = await fetchWithTimeout("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.notifications.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.notifications.alertFromEmail,
        to: [toEmail],
        subject: input.title,
        text: input.body,
      }),
    });

    if (!response.ok) {
      return {
        status: "failed",
        error: `Resend delivery failed with ${response.status}.`,
      };
    }
    return { status: "sent" };
  } catch (error) {
    return {
      status: "failed",
      error: isAbortError(error)
        ? "Resend delivery timed out."
        : "Resend delivery failed before receiving a response.",
    };
  }
}
