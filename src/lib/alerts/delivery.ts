import "server-only";

import type { AlertChannel } from "@/lib/alerts/types";
import { env, integrations } from "@/lib/env";

export type DeliveryStatus = "sent" | "suppressed" | "failed";

export interface DeliveryInput {
  channel: AlertChannel;
  title: string;
  body: string;
}

export interface DeliveryResult {
  status: DeliveryStatus;
  error?: string;
}

export async function deliverAlert(input: DeliveryInput): Promise<DeliveryResult> {
  if (input.channel === "in_app") return { status: "sent" };
  if (input.channel === "slack") return deliverSlack(input);
  if (input.channel === "email") return deliverEmail(input);
  return {
    status: "suppressed",
    error: `${input.channel} delivery is not implemented yet.`,
  };
}

async function deliverSlack(input: DeliveryInput): Promise<DeliveryResult> {
  if (!integrations.slack || !env.notifications.slackWebhookUrl) {
    return { status: "suppressed", error: "Slack webhook is not configured." };
  }

  const response = await fetch(env.notifications.slackWebhookUrl, {
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
}

async function deliverEmail(input: DeliveryInput): Promise<DeliveryResult> {
  if (!integrations.resend || !env.notifications.resendApiKey) {
    return { status: "suppressed", error: "Resend is not configured." };
  }
  if (!env.notifications.alertFromEmail || !env.notifications.alertToEmail) {
    return {
      status: "suppressed",
      error: "Alert email sender or recipient is not configured.",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.notifications.resendApiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.notifications.alertFromEmail,
      to: [env.notifications.alertToEmail],
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
}
