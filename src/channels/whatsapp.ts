import {
  createHmac,
  timingSafeEqual
} from "node:crypto";

import type {
  IncomingChannelMessage
} from "./types.ts";

type JsonRecord = Record<string, unknown>;

export type WhatsAppConfiguration = {
  appId?: string;
  appSecret?: string;
  verifyToken?: string;
  accessToken?: string;
  phoneNumberId?: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function asRecords(value: unknown) {
  return Array.isArray(value)
    ? value.filter(isRecord)
    : [];
}

export function getWhatsAppConnectionStatus(
  config: WhatsAppConfiguration
) {
  const required = [
    ["META_APP_ID", config.appId],
    ["META_APP_SECRET", config.appSecret],
    ["WHATSAPP_VERIFY_TOKEN", config.verifyToken],
    ["WHATSAPP_ACCESS_TOKEN", config.accessToken],
    ["WHATSAPP_PHONE_NUMBER_ID", config.phoneNumberId]
  ] as const;

  const missing = required
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    provider: "meta_cloud_api" as const,
    mode: missing.length === 0
      ? "credentials_ready" as const
      : "simulator" as const,
    configured: missing.length === 0,
    webhookPath: "/api/webhooks/whatsapp",
    missing
  };
}

export function verifyWhatsAppWebhookSignature(
  body: Buffer,
  suppliedSignature: string | undefined,
  appSecret: string | undefined
) {
  if (!suppliedSignature || !appSecret) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", appSecret)
    .update(body)
    .digest("hex")}`;
  const supplied = Buffer.from(suppliedSignature);
  const target = Buffer.from(expected);

  return (
    supplied.length === target.length &&
    timingSafeEqual(supplied, target)
  );
}

export function parseWhatsAppWebhookPayload(
  payload: unknown
): IncomingChannelMessage[] {
  if (
    !isRecord(payload) ||
    payload.object !== "whatsapp_business_account"
  ) {
    return [];
  }

  const result: IncomingChannelMessage[] = [];

  for (const entry of asRecords(payload.entry)) {
    for (const change of asRecords(entry.changes)) {
      const value = change.value;

      if (!isRecord(value)) continue;

      for (const message of asRecords(value.messages)) {
        const text = message.text;

        if (
          message.type !== "text" ||
          typeof message.id !== "string" ||
          typeof message.from !== "string" ||
          !isRecord(text) ||
          typeof text.body !== "string"
        ) {
          continue;
        }

        const timestamp = typeof message.timestamp === "string"
          ? Number(message.timestamp)
          : Number.NaN;

        result.push({
          channel: "whatsapp",
          externalMessageId: message.id,
          externalContactId: message.from,
          text: text.body,
          receivedAt: Number.isFinite(timestamp)
            ? new Date(timestamp * 1000).toISOString()
            : undefined
        });
      }
    }
  }

  return result;
}
