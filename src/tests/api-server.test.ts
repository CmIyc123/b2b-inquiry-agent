import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";

import {
  createApiServer
} from "../api/server.ts";

import type {
  ConversationApplicationService
} from "../application/conversation-service.ts";

import type {
  ChannelApplicationService
} from "../application/channel-service.ts";

import type {
  IncomingChannelMessage
} from "../channels/types.ts";

import type {
  DataApplicationService
} from "../application/data-service.ts";

function createMockServices() {
  const messages: Array<{
    conversationId: string;
    message: string;
  }> = [];

  const channelMessages: IncomingChannelMessage[] = [];

  const conversations: ConversationApplicationService = {
    async sendMessage(conversationId, message) {
      messages.push({ conversationId, message });
      return `Reply to: ${message}`;
    },
    disposeAll() {}
  };

  const channels: ChannelApplicationService = {
    async processInbound(message) {
      channelMessages.push(message);
      return {
        outcome: "completed" as const,
        conversationId: `whatsapp:${message.externalContactId}`,
        reply: `Reply to: ${message.text}`
      };
    }
  };

  const data: DataApplicationService = {
    async health() {
      return {
        status: "ok",
        storage: "sqlite"
      };
    },
    async findLeads(email) {
      return [
        {
          id: "lead-api-001",
          name: "Alice",
          contactEmail: email,
          company: "Example Materials",
          country: "France",
          product: "Product A",
          quantity: 500,
          unit: "g",
          purity: "99%",
          deliveryAddress: "Lyon, France",
          incoterm: "DAP",
          requestCoa: true,
          requestQuote: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ];
    },
    async findLead() {
      return null;
    },
    async listReviews() {
      return [];
    },
    async decideReview(reviewId) {
      return {
        outcome: "review_not_found" as const,
        reviewId
      };
    },
    async lookupQuote(quoteNumber) {
      return {
        quoteNumber,
        status: "sent",
        product: "Product A",
        purity: "99%",
        quantity: 500,
        unit: "g",
        unitPrice: 1.25,
        unitPriceBasis: "g",
        totalPrice: 625,
        currency: "USD",
        incoterm: "DAP",
        deliveryAddress: "Lyon, France",
        leadTimeDays: 7,
        coaStatus: "available",
        sentAt: "2026-01-02T00:00:00.000Z",
        respondedAt: null,
        expiresAt: "2026-01-16T00:00:00.000Z",
        responseReason: null,
        customerTargetPrice: null
      };
    },
    async markQuoteSent(quoteNumber) {
      return {
        outcome: "quote_not_found" as const,
        quoteNumber
      };
    },
    async importProductDocument(input) {
      return {
        outcome: "imported" as const,
        document: {
          id: "doc-api-001",
          productSku: input.productSku,
          documentType: input.documentType,
          title: input.title,
          originalFilename: input.filename,
          mimeType: input.mimeType,
          checksumSha256: "abc123",
          version: 1,
          status: "active" as const,
          characterCount: 42,
          chunkCount: 1,
          createdAt: "2026-09-20T00:00:00.000Z"
        }
      };
    },
    async listProductDocuments() {
      return [];
    },
    async searchProductDocuments() {
      return [];
    }
  };

  return {
    conversations,
    channels,
    data,
    messages,
    channelMessages
  };
}

async function startTestServer() {
  const mocks = createMockServices();
  const server = createApiServer({
    conversations: mocks.conversations,
    channels: mocks.channels,
    data: mocks.data,
    whatsapp: {
      appId: "meta-app-test",
      appSecret: "meta-secret-test",
      verifyToken: "verify-token-test",
      accessToken: "access-token-test",
      phoneNumberId: "phone-number-test"
    },
    adminApiKey: "test-admin-key"
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;

  return {
    ...mocks,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test("API 健康检查和聊天接口返回统一 JSON", async (t) => {
  const fixture = await startTestServer();

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      fixture.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  const healthResponse = await fetch(
    `${fixture.baseUrl}/api/health`
  );
  const health = await healthResponse.json();

  assert.equal(healthResponse.status, 200);
  assert.deepEqual(health, {
    status: "ok",
    storage: "sqlite"
  });

  const pageResponse = await fetch(fixture.baseUrl);
  const page = await pageResponse.text();

  assert.equal(pageResponse.status, 200);
  assert.match(page, /B2B Inquiry Agent · 外贸询盘工作台/);
  assert.match(
    pageResponse.headers.get("content-security-policy") ?? "",
    /default-src 'self'/
  );

  const chatResponse = await fetch(
    `${fixture.baseUrl}/api/chat/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        conversationId: "web-session-001",
        message: "Hello"
      })
    }
  );
  const chat = await chatResponse.json();

  assert.equal(chatResponse.status, 200);
  assert.deepEqual(chat, {
    conversationId: "web-session-001",
    reply: "Reply to: Hello"
  });
  assert.deepEqual(fixture.messages, [
    {
      conversationId: "web-session-001",
      message: "Hello"
    }
  ]);
});

test("管理员可以导入产品文档并建立知识索引", async (t) => {
  const fixture = await startTestServer();

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      fixture.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  const response = await fetch(
    `${fixture.baseUrl}/api/knowledge/documents`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-api-key": "test-admin-key"
      },
      body: JSON.stringify({
        productSku: "PA-99",
        documentType: "tds",
        title: "Product A TDS",
        filename: "product-a.md",
        mimeType: "text/markdown",
        contentBase64: Buffer.from(
          "Product A technical specification and handling details."
        ).toString("base64")
      })
    }
  );
  const result = await response.json();

  assert.equal(response.status, 201);
  assert.equal(result.outcome, "imported");
  assert.equal(result.document.productSku, "PA-99");
  assert.equal(result.document.version, 1);
});

test("管理数据接口必须通过 API Key 鉴权", async (t) => {
  const fixture = await startTestServer();

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      fixture.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  const unauthorized = await fetch(
    `${fixture.baseUrl}/api/leads?email=alice@example.com`
  );

  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(
    `${fixture.baseUrl}/api/leads?email=alice@example.com`,
    {
      headers: {
        "x-admin-api-key": "test-admin-key"
      }
    }
  );
  const body = await authorized.json() as {
    leads: Array<{ contactEmail: string }>;
  };

  assert.equal(authorized.status, 200);
  assert.equal(
    body.leads[0]?.contactEmail,
    "alice@example.com"
  );
});

test("API 拒绝无效请求且报价查询只返回安全投影", async (t) => {
  const fixture = await startTestServer();

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      fixture.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  const invalidResponse = await fetch(
    `${fixture.baseUrl}/api/chat/messages`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        conversationId: "",
        message: "Hello"
      })
    }
  );

  assert.equal(invalidResponse.status, 400);

  const quoteResponse = await fetch(
    `${fixture.baseUrl}/api/quotes/Q-20260101-A1B2C3D4`
  );
  const quote = await quoteResponse.json() as Record<
    string,
    unknown
  >;

  assert.equal(quoteResponse.status, 200);
  assert.equal(quote.status, "sent");
  assert.equal(Object.hasOwn(quote, "reviewId"), false);
  assert.equal(Object.hasOwn(quote, "statusHistory"), false);
});

test("WhatsApp 渠道支持配置检查、模拟消息和签名 Webhook", async (t) => {
  const fixture = await startTestServer();

  t.after(async () => {
    await new Promise<void>((resolve, reject) => {
      fixture.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  });

  const statusResponse = await fetch(
    `${fixture.baseUrl}/api/channels/whatsapp/status`,
    {
      headers: {
        "x-admin-api-key": "test-admin-key"
      }
    }
  );
  const status = await statusResponse.json() as {
    configured: boolean;
    mode: string;
  };

  assert.equal(statusResponse.status, 200);
  assert.equal(status.configured, true);
  assert.equal(status.mode, "credentials_ready");

  const simulatedResponse = await fetch(
    `${fixture.baseUrl}/api/channels/whatsapp/simulate`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-api-key": "test-admin-key"
      },
      body: JSON.stringify({
        messageId: "wamid.simulated-001",
        from: "33600000000",
        text: "Please quote Product A"
      })
    }
  );
  const simulated = await simulatedResponse.json() as {
    outcome: string;
    reply: string;
  };

  assert.equal(simulatedResponse.status, 200);
  assert.equal(simulated.outcome, "completed");
  assert.equal(
    simulated.reply,
    "Reply to: Please quote Product A"
  );

  const verification = await fetch(
    `${fixture.baseUrl}/api/webhooks/whatsapp?` +
    new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "verify-token-test",
      "hub.challenge": "challenge-123"
    })
  );

  assert.equal(verification.status, 200);
  assert.equal(await verification.text(), "challenge-123");

  const webhookPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.webhook-001",
                  from: "33600000001",
                  type: "text",
                  timestamp: "1789891200",
                  text: {
                    body: "We need 500 g of Product A"
                  }
                }
              ]
            }
          }
        ]
      }
    ]
  };
  const rawBody = JSON.stringify(webhookPayload);
  const signature = "sha256=" + createHmac(
    "sha256",
    "meta-secret-test"
  ).update(rawBody).digest("hex");

  const webhookResponse = await fetch(
    `${fixture.baseUrl}/api/webhooks/whatsapp`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": signature
      },
      body: rawBody
    }
  );

  assert.equal(webhookResponse.status, 200);
  assert.deepEqual(await webhookResponse.json(), {
    accepted: 1
  });

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(fixture.channelMessages.length, 2);
  assert.equal(
    fixture.channelMessages[1]?.externalMessageId,
    "wamid.webhook-001"
  );

  const rejected = await fetch(
    `${fixture.baseUrl}/api/webhooks/whatsapp`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=invalid"
      },
      body: rawBody
    }
  );

  assert.equal(rejected.status, 401);
});
