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
  createQuoteDraft,
  type QuoteDraft
} from "../data/quotes.ts";

import type { Lead } from "../data/leads.ts";
import type { ReviewTask } from "../data/reviews.ts";

function createLead(): Lead {
  return {
    id: "lead-quote-001",
    name: "Alice",
    contactEmail: "alice@example.com",
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
  };
}

function createReview(
  overrides: Partial<ReviewTask> = {}
): ReviewTask {
  return {
    id: "review-quote-001",
    leadId: "lead-quote-001",
    status: "approved",
    requestedChecks: [
      "inventory",
      "pricing",
      "lead_time",
      "coa"
    ],
    inventoryConfirmed: true,
    unitPrice: 1.25,
    currency: "USD",
    leadTimeDays: 7,
    coaStatus: "available",
    reviewNotes: "Internal only",
    reviewedBy: "sales-admin",
    reviewedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    ...overrides
  };
}

async function createTemporaryData(
  review: ReviewTask
) {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-quote-")
  );

  const leadsFile = join(directory, "leads.json");
  const reviewQueueFile = join(
    directory,
    "review-queue.json"
  );
  const quotesFile = join(directory, "quotes.json");

  await Promise.all([
    writeFile(
      leadsFile,
      JSON.stringify([createLead()], null, 2),
      "utf-8"
    ),
    writeFile(
      reviewQueueFile,
      JSON.stringify([review], null, 2),
      "utf-8"
    ),
    writeFile(quotesFile, "[]", "utf-8")
  ]);

  return {
    directory,
    leadsFile,
    reviewQueueFile,
    quotesFile
  };
}

test("已批准审核可以生成确定性报价草稿且不会重复", async (t) => {
  const temporary = await createTemporaryData(
    createReview()
  );

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const firstResult = await createQuoteDraft(
    "lead-quote-001",
    temporary.leadsFile,
    temporary.reviewQueueFile,
    temporary.quotesFile
  );

  const secondResult = await createQuoteDraft(
    "lead-quote-001",
    temporary.leadsFile,
    temporary.reviewQueueFile,
    temporary.quotesFile
  );

  assert.equal(firstResult.outcome, "created");
  assert.equal(secondResult.outcome, "already_exists");

  if (firstResult.outcome !== "created") {
    assert.fail("预期创建报价草稿成功");
  }

  assert.match(
    firstResult.quote.quoteNumber,
    /^Q-\d{8}-[A-F0-9]{8}$/
  );
  assert.equal(firstResult.quote.unitPrice, 1.25);
  assert.equal(firstResult.quote.unitPriceBasis, "g");
  assert.equal(firstResult.quote.totalPrice, 625);
  assert.equal(firstResult.quote.currency, "USD");

  const quoteText = await readFile(
    temporary.quotesFile,
    "utf-8"
  );
  const quotes: QuoteDraft[] = JSON.parse(quoteText);

  assert.equal(quotes.length, 1);
});

test("审核未批准时拒绝生成报价草稿", async (t) => {
  const temporary = await createTemporaryData(
    createReview({
      status: "pending",
      inventoryConfirmed: null,
      unitPrice: null,
      currency: null,
      leadTimeDays: null,
      coaStatus: null,
      reviewedBy: null,
      reviewedAt: null
    })
  );

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await createQuoteDraft(
    "lead-quote-001",
    temporary.leadsFile,
    temporary.reviewQueueFile,
    temporary.quotesFile
  );

  assert.deepEqual(result, {
    outcome: "review_not_approved",
    leadId: "lead-quote-001",
    reviewStatus: "pending"
  });

  const quoteText = await readFile(
    temporary.quotesFile,
    "utf-8"
  );

  assert.deepEqual(JSON.parse(quoteText), []);
});
