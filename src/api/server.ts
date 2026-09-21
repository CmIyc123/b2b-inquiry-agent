import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse
} from "node:http";
import { join } from "node:path";

import {
  ConversationBusyError,
  type ConversationApplicationService
} from "../application/conversation-service.ts";

import type {
  ChannelApplicationService
} from "../application/channel-service.ts";

import {
  getWhatsAppConnectionStatus,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
  type WhatsAppConfiguration
} from "../channels/whatsapp.ts";

import type {
  DataApplicationService
} from "../application/data-service.ts";

import type {
  CoaStatus,
  ReviewDecisionInput,
  ReviewStatus
} from "../data/reviews.ts";

import {
  KnowledgeValidationError
} from "../application/knowledge-service.ts";

import {
  PRODUCT_DOCUMENT_TYPES,
  type ProductDocumentType
} from "../knowledge/types.ts";

type ApiServerOptions = {
  conversations: ConversationApplicationService;
  channels: ChannelApplicationService;
  data: DataApplicationService;
  whatsapp: WhatsAppConfiguration;
  adminApiKey?: string;
  frontendOrigin?: string;
};

type JsonRecord = Record<string, unknown>;

const MAX_BODY_BYTES = 64 * 1024;
const MAX_DOCUMENT_BODY_BYTES = 12 * 1024 * 1024;

const STATIC_FILES = new Map([
  ["/", {
    file: join(process.cwd(), "public", "index.html"),
    contentType: "text/html; charset=utf-8"
  }],
  ["/app.js", {
    file: join(process.cwd(), "public", "app.js"),
    contentType: "text/javascript; charset=utf-8"
  }],
  ["/styles.css", {
    file: join(process.cwd(), "public", "styles.css"),
    contentType: "text/css; charset=utf-8"
  }]
]);

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown
) {
  const json = JSON.stringify(body);

  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(json)
  });

  response.end(json);
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  body: string
) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

async function sendStaticFile(
  response: ServerResponse,
  path: string
) {
  const definition = STATIC_FILES.get(path);

  if (!definition) {
    return false;
  }

  const file = await readFile(definition.file);

  response.writeHead(200, {
    "content-type": definition.contentType,
    "content-length": file.length,
    "cache-control": "no-cache"
  });
  response.end(file);
  return true;
}

async function readRequestBody(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES
) {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    size += buffer.length;

    if (size > maxBytes) {
      throw new BadRequestError("请求内容过大");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    throw new BadRequestError("请求体不能为空");
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES
) {
  const contentType = request.headers["content-type"] ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    throw new BadRequestError(
      "Content-Type 必须是 application/json"
    );
  }

  const body = await readRequestBody(request, maxBytes);

  try {
    return JSON.parse(body.toString("utf-8")) as unknown;
  } catch {
    throw new BadRequestError("请求体不是有效 JSON");
  }
}

function secureEqual(first: string, second: string) {
  const firstBuffer = Buffer.from(first);
  const secondBuffer = Buffer.from(second);

  return (
    firstBuffer.length === secondBuffer.length &&
    timingSafeEqual(firstBuffer, secondBuffer)
  );
}

function requireAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  adminApiKey?: string
) {
  if (!adminApiKey) {
    sendJson(response, 503, {
      error: "admin_api_not_configured"
    });
    return false;
  }

  const suppliedKey = request.headers["x-admin-api-key"];

  if (
    typeof suppliedKey !== "string" ||
    !secureEqual(suppliedKey, adminApiKey)
  ) {
    sendJson(response, 401, {
      error: "unauthorized"
    });
    return false;
  }

  return true;
}

function nullableString(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new BadRequestError(
      "字段必须是字符串或 null"
    );
  }

  return value;
}

function nullableNumber(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BadRequestError(
      "字段必须是有限数字或 null"
    );
  }

  return value;
}

function parseReviewDecision(
  value: unknown
): ReviewDecisionInput {
  if (!isRecord(value)) {
    throw new BadRequestError(
      "审核请求必须是 JSON 对象"
    );
  }

  if (
    value.decision !== "approved" &&
    value.decision !== "rejected"
  ) {
    throw new BadRequestError(
      "decision 必须是 approved 或 rejected"
    );
  }

  if (typeof value.reviewedBy !== "string") {
    throw new BadRequestError(
      "reviewedBy 必须是字符串"
    );
  }

  const coaStatus = value.coaStatus;

  if (
    coaStatus !== null &&
    coaStatus !== "available" &&
    coaStatus !== "unavailable" &&
    coaStatus !== "not_requested"
  ) {
    throw new BadRequestError("coaStatus 无效");
  }

  if (
    value.inventoryConfirmed !== null &&
    typeof value.inventoryConfirmed !== "boolean"
  ) {
    throw new BadRequestError(
      "inventoryConfirmed 必须是布尔值或 null"
    );
  }

  return {
    decision: value.decision,
    inventoryConfirmed: value.inventoryConfirmed,
    unitPrice: nullableNumber(value.unitPrice),
    currency: nullableString(value.currency),
    leadTimeDays: nullableNumber(value.leadTimeDays),
    coaStatus: coaStatus as CoaStatus | null,
    reviewNotes: nullableString(value.reviewNotes),
    reviewedBy: value.reviewedBy
  };
}

export function createApiServer(options: ApiServerOptions) {
  return createServer(async (request, response) => {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
    );

    if (options.frontendOrigin) {
      response.setHeader(
        "access-control-allow-origin",
        options.frontendOrigin
      );
      response.setHeader(
        "access-control-allow-headers",
        "content-type, x-admin-api-key"
      );
      response.setHeader(
        "access-control-allow-methods",
        "GET, POST, OPTIONS"
      );
    }

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const url = new URL(
      request.url ?? "/",
      "http://localhost"
    );

    try {
      if (
        request.method === "GET" &&
        await sendStaticFile(response, url.pathname)
      ) {
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/health"
      ) {
        sendJson(response, 200, await options.data.health());
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/knowledge/documents"
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const body = await readJsonBody(
          request,
          MAX_DOCUMENT_BODY_BYTES
        );

        if (
          !isRecord(body) ||
          typeof body.productSku !== "string" ||
          typeof body.documentType !== "string" ||
          typeof body.title !== "string" ||
          typeof body.filename !== "string" ||
          typeof body.mimeType !== "string" ||
          typeof body.contentBase64 !== "string" ||
          !PRODUCT_DOCUMENT_TYPES.includes(
            body.documentType as ProductDocumentType
          )
        ) {
          throw new BadRequestError(
            "产品、文档类型、标题和文件内容无效"
          );
        }

        const result = await options.data.importProductDocument({
          productSku: body.productSku,
          documentType:
            body.documentType as ProductDocumentType,
          title: body.title,
          filename: body.filename,
          mimeType: body.mimeType,
          contentBase64: body.contentBase64
        });

        sendJson(
          response,
          result.outcome === "imported" ? 201 : 200,
          result
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/knowledge/documents"
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const documents = await options.data.listProductDocuments(
          url.searchParams.get("productSku")
        );

        sendJson(response, 200, { documents });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/knowledge/search"
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const query = url.searchParams.get("query");

        if (!query) {
          throw new BadRequestError(
            "必须提供 query 查询参数"
          );
        }

        const matches = await options.data.searchProductDocuments(
          query,
          url.searchParams.get("productSku"),
          5
        );

        sendJson(response, 200, { matches });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/channels/whatsapp/status"
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        sendJson(
          response,
          200,
          getWhatsAppConnectionStatus(options.whatsapp)
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/channels/whatsapp/simulate"
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const body = await readJsonBody(request);

        if (
          !isRecord(body) ||
          typeof body.messageId !== "string" ||
          typeof body.from !== "string" ||
          typeof body.text !== "string"
        ) {
          throw new BadRequestError(
            "messageId、from 和 text 必须是字符串"
          );
        }

        const result = await options.channels.processInbound({
          channel: "whatsapp",
          externalMessageId: body.messageId,
          externalContactId: body.from,
          text: body.text
        });

        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/webhooks/whatsapp"
      ) {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        if (
          mode === "subscribe" &&
          token !== null &&
          challenge !== null &&
          options.whatsapp.verifyToken &&
          secureEqual(token, options.whatsapp.verifyToken)
        ) {
          sendText(response, 200, challenge);
          return;
        }

        sendJson(response, 403, {
          error: "webhook_verification_failed"
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/webhooks/whatsapp"
      ) {
        const rawBody = await readRequestBody(request);
        const signature = request.headers[
          "x-hub-signature-256"
        ];

        if (
          !verifyWhatsAppWebhookSignature(
            rawBody,
            typeof signature === "string"
              ? signature
              : undefined,
            options.whatsapp.appSecret
          )
        ) {
          sendJson(response, 401, {
            error: "invalid_webhook_signature"
          });
          return;
        }

        let payload: unknown;

        try {
          payload = JSON.parse(rawBody.toString("utf-8"));
        } catch {
          throw new BadRequestError(
            "Webhook 请求体不是有效 JSON"
          );
        }

        const messages = parseWhatsAppWebhookPayload(payload);

        for (const message of messages) {
          void options.channels.processInbound(message).catch(
            (error) => {
              console.error(
                "WhatsApp 消息处理失败：",
                error
              );
            }
          );
        }

        sendJson(response, 200, {
          accepted: messages.length
        });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/api/chat/messages"
      ) {
        const body = await readJsonBody(request);

        if (!isRecord(body)) {
          throw new BadRequestError(
            "请求体必须是 JSON 对象"
          );
        }

        const conversationId = body.conversationId;
        const message = body.message;

        if (
          typeof conversationId !== "string" ||
          conversationId.trim() === "" ||
          conversationId.length > 128
        ) {
          throw new BadRequestError(
            "conversationId 无效"
          );
        }

        if (
          typeof message !== "string" ||
          message.trim() === "" ||
          message.length > 10_000
        ) {
          throw new BadRequestError("message 无效");
        }

        const reply = await options.conversations.sendMessage(
          conversationId.trim(),
          message.trim()
        );

        sendJson(response, 200, {
          conversationId: conversationId.trim(),
          reply
        });
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/leads"
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const email = url.searchParams.get("email");

        if (!email) {
          throw new BadRequestError(
            "必须提供 email 查询参数"
          );
        }

        const leads = await options.data.findLeads(
          email,
          url.searchParams.get("product")
        );

        sendJson(response, 200, { leads });
        return;
      }

      const leadMatch = url.pathname.match(
        /^\/api\/leads\/([^/]+)$/
      );

      if (request.method === "GET" && leadMatch) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const lead = await options.data.findLead(
          decodeURIComponent(leadMatch[1] ?? "")
        );

        sendJson(
          response,
          lead ? 200 : 404,
          lead ?? { error: "lead_not_found" }
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/api/reviews"
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const statusValue = url.searchParams.get("status");
        let status: ReviewStatus | undefined;

        if (statusValue !== null) {
          if (
            statusValue !== "pending" &&
            statusValue !== "approved" &&
            statusValue !== "rejected"
          ) {
            throw new BadRequestError(
              "review status 无效"
            );
          }

          status = statusValue;
        }

        const reviews = await options.data.listReviews(status);
        sendJson(response, 200, { reviews });
        return;
      }

      const reviewDecisionMatch = url.pathname.match(
        /^\/api\/reviews\/([^/]+)\/decision$/
      );

      if (
        request.method === "POST" &&
        reviewDecisionMatch
      ) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const input = parseReviewDecision(
          await readJsonBody(request)
        );

        const result = await options.data.decideReview(
          decodeURIComponent(
            reviewDecisionMatch[1] ?? ""
          ),
          input
        );

        sendJson(response, 200, result);
        return;
      }

      const quoteSentMatch = url.pathname.match(
        /^\/api\/quotes\/([^/]+)\/sent$/
      );

      if (request.method === "POST" && quoteSentMatch) {
        if (!requireAdmin(
          request,
          response,
          options.adminApiKey
        )) {
          return;
        }

        const body = await readJsonBody(request);

        if (
          !isRecord(body) ||
          typeof body.validDays !== "number" ||
          !Number.isInteger(body.validDays) ||
          body.validDays <= 0
        ) {
          throw new BadRequestError(
            "validDays 必须是正整数"
          );
        }

        const result = await options.data.markQuoteSent(
          decodeURIComponent(quoteSentMatch[1] ?? ""),
          body.validDays
        );

        sendJson(response, 200, result);
        return;
      }

      const quoteMatch = url.pathname.match(
        /^\/api\/quotes\/([^/]+)$/
      );

      if (request.method === "GET" && quoteMatch) {
        const quote = await options.data.lookupQuote(
          decodeURIComponent(quoteMatch[1] ?? "")
        );

        sendJson(
          response,
          quote ? 200 : 404,
          quote ?? { error: "quote_not_found" }
        );
        return;
      }

      sendJson(response, 404, {
        error: "route_not_found"
      });
    } catch (error) {
      if (error instanceof ConversationBusyError) {
        sendJson(response, 409, {
          error: "conversation_busy"
        });
        return;
      }

      if (error instanceof BadRequestError) {
        sendJson(response, 400, {
          error: "bad_request",
          message: error.message
        });
        return;
      }

      if (error instanceof KnowledgeValidationError) {
        sendJson(response, 400, {
          error: "invalid_document",
          message: error.message
        });
        return;
      }

      console.error("API 请求处理失败：", error);

      sendJson(response, 500, {
        error: "internal_error"
      });
    }
  });
}
