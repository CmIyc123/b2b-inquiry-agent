import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  expireQuote,
  lookupQuoteStatus,
  markQuoteSent,
  recordQuoteResponse,
  type QuoteDraft
} from "../data/quotes.ts";

function createDraftQuote(): QuoteDraft {
  return {
    id: "quote-id-001",
    quoteNumber: "Q-20260101-ABCDEF12",
    leadId: "lead-001",
    reviewId: "review-001",
    status: "draft",
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
    sentAt: null,
    respondedAt: null,
    expiresAt: null,
    responseReason: null,
    customerTargetPrice: null,
    customerFeedback: null,
    statusHistory: [
      {
        from: null,
        to: "draft",
        source: "system",
        time: "2026-01-01T00:00:00.000Z",
        responseReason: null,
        customerTargetPrice: null,
        customerFeedback: null
      }
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

async function createTemporaryQuotes() {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-quote-life-")
  );
  const quotesFile = join(directory, "quotes.json");

  await writeFile(
    quotesFile,
    JSON.stringify([createDraftQuote()], null, 2),
    "utf-8"
  );

  return {
    directory,
    quotesFile
  };
}

test("后台确认发送后记录发送时间和有效期", async (t) => {
  const temporary = await createTemporaryQuotes();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await markQuoteSent(
    "q-20260101-abcdef12",
    14,
    temporary.quotesFile,
    new Date("2026-01-02T00:00:00.000Z")
  );

  assert.equal(result.outcome, "sent");

  if (result.outcome !== "sent") {
    assert.fail("预期报价发送成功");
  }

  assert.equal(result.quote.status, "sent");
  assert.equal(
    result.quote.expiresAt,
    "2026-01-16T00:00:00.000Z"
  );
  assert.equal(result.quote.statusHistory.length, 2);
});

test("草稿不能直接记录为客户接受", async (t) => {
  const temporary = await createTemporaryQuotes();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await recordQuoteResponse(
    "Q-20260101-ABCDEF12",
    { response: "accepted" },
    temporary.quotesFile
  );

  assert.deepEqual(result, {
    outcome: "invalid_transition",
    currentStatus: "draft",
    requestedStatus: "accepted"
  });
});

test("客户还价后可以接受并保留完整状态历史", async (t) => {
  const temporary = await createTemporaryQuotes();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  await markQuoteSent(
    "Q-20260101-ABCDEF12",
    14,
    temporary.quotesFile,
    new Date("2026-01-02T00:00:00.000Z")
  );

  const negotiation = await recordQuoteResponse(
    "Q-20260101-ABCDEF12",
    {
      response: "negotiating",
      responseReason: "price_too_high",
      customerTargetPrice: 1.1,
      customerFeedback: "Can you offer 1.10 USD per g?"
    },
    temporary.quotesFile,
    new Date("2026-01-03T00:00:00.000Z")
  );

  assert.equal(negotiation.outcome, "recorded");

  const accepted = await recordQuoteResponse(
    "Q-20260101-ABCDEF12",
    { response: "accepted" },
    temporary.quotesFile,
    new Date("2026-01-04T00:00:00.000Z")
  );

  assert.equal(accepted.outcome, "recorded");

  if (accepted.outcome !== "recorded") {
    assert.fail("预期客户接受被记录");
  }

  assert.equal(accepted.quote.status, "accepted");
  assert.equal(accepted.quote.statusHistory.length, 4);

  const persistedText = await readFile(
    temporary.quotesFile,
    "utf-8"
  );
  const persisted: QuoteDraft[] = JSON.parse(persistedText);

  assert.equal(persisted[0]?.status, "accepted");
});

test("已结束报价不能被二次改写", async (t) => {
  const temporary = await createTemporaryQuotes();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  await markQuoteSent(
    "Q-20260101-ABCDEF12",
    14,
    temporary.quotesFile
  );

  await recordQuoteResponse(
    "Q-20260101-ABCDEF12",
    { response: "rejected" },
    temporary.quotesFile
  );

  const result = await recordQuoteResponse(
    "Q-20260101-ABCDEF12",
    { response: "accepted" },
    temporary.quotesFile
  );

  assert.equal(result.outcome, "already_final");
});

test("报价到期后才能标记为 expired", async (t) => {
  const temporary = await createTemporaryQuotes();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  await markQuoteSent(
    "Q-20260101-ABCDEF12",
    1,
    temporary.quotesFile,
    new Date("2026-01-02T00:00:00.000Z")
  );

  const earlyResult = await expireQuote(
    "Q-20260101-ABCDEF12",
    temporary.quotesFile,
    new Date("2026-01-02T12:00:00.000Z")
  );

  const dueResult = await expireQuote(
    "Q-20260101-ABCDEF12",
    temporary.quotesFile,
    new Date("2026-01-03T00:00:00.000Z")
  );

  assert.equal(earlyResult.outcome, "not_due");
  assert.equal(dueResult.outcome, "expired");
});

test("客户查询报价只返回安全的业务字段", async (t) => {
  const temporary = await createTemporaryQuotes();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await lookupQuoteStatus(
    "Q-20260101-ABCDEF12",
    temporary.quotesFile
  );

  assert.ok(result);
  assert.equal(result.status, "draft");
  assert.equal(Object.hasOwn(result, "reviewId"), false);
  assert.equal(Object.hasOwn(result, "statusHistory"), false);
  assert.equal(Object.hasOwn(result, "customerFeedback"), false);
});
