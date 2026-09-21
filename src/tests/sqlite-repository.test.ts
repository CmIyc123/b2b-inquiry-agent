import test from "node:test";
import assert from "node:assert/strict";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  initializeDatabase
} from "../db/database.ts";

import {
  SqliteAgentEventRepository,
  SqliteLeadRepository,
  SqliteQuoteRepository,
  SqliteReviewRepository
} from "../repositories/sqlite.ts";

import type { Lead } from "../data/leads.ts";
import type { ReviewTask } from "../data/reviews.ts";
import type { QuoteDraft } from "../data/quotes.ts";

async function createTemporaryDatabase() {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-repository-")
  );

  return {
    directory,
    databaseFile: join(directory, "dateagent.db")
  };
}

function createLead(): Lead {
  return {
    id: "lead-repository-001",
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

function createReview(): ReviewTask {
  return {
    id: "review-repository-001",
    leadId: "lead-repository-001",
    status: "pending",
    requestedChecks: [
      "inventory",
      "pricing",
      "lead_time",
      "coa"
    ],
    inventoryConfirmed: null,
    unitPrice: null,
    currency: null,
    leadTimeDays: null,
    coaStatus: null,
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function createQuote(): QuoteDraft {
  return {
    id: "quote-repository-001",
    quoteNumber: "Q-20260101-A1B2C3D4",
    leadId: "lead-repository-001",
    reviewId: "review-repository-001",
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

test("SQLite Repository 完成关联读写并保留局部更新", async (t) => {
  const fixture = await createTemporaryDatabase();

  t.after(async () => {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  });

  const leadRepository = new SqliteLeadRepository(
    fixture.databaseFile
  );
  const reviewRepository = new SqliteReviewRepository(
    fixture.databaseFile
  );
  const quoteRepository = new SqliteQuoteRepository(
    fixture.databaseFile
  );
  const eventRepository =
    new SqliteAgentEventRepository(
      fixture.databaseFile
    );

  await leadRepository.insert(createLead());

  const updatedLead = await leadRepository.update(
    "lead-repository-001",
    { incoterm: "CIF" },
    "2026-01-02T00:00:00.000Z"
  );

  assert.equal(updatedLead?.incoterm, "CIF");
  assert.equal(
    updatedLead?.contactEmail,
    "alice@example.com"
  );
  assert.equal(
    updatedLead?.deliveryAddress,
    "Lyon, France"
  );

  assert.equal(
    await reviewRepository.insert(createReview()),
    true
  );

  const review = await reviewRepository.findLatestByLeadId(
    "lead-repository-001"
  );

  assert.ok(review);
  assert.deepEqual(review.requestedChecks, [
    "inventory",
    "pricing",
    "lead_time",
    "coa"
  ]);

  await quoteRepository.insert(createQuote());
  const quote = await quoteRepository.findByNumber(
    "q-20260101-a1b2c3d4"
  );

  assert.equal(quote?.totalPrice, 625);
  assert.equal(quote?.statusHistory.length, 1);

  await eventRepository.insert({
    time: "2026-01-01T00:00:00.000Z",
    toolCallId: "call-repository-001",
    toolName: "lookup_product",
    stage: "end",
    status: "success"
  });

  const database = initializeDatabase(
    fixture.databaseFile
  );

  try {
    const eventCount = database.prepare(`
      SELECT COUNT(*) AS count FROM agent_events
    `).get() as { count: number };

    assert.equal(eventCount.count, 1);
  } finally {
    database.close();
  }
});

test("Repository 用 updatedAt 阻止过期请求覆盖新状态", async (t) => {
  const fixture = await createTemporaryDatabase();

  t.after(async () => {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  });

  const leadRepository = new SqliteLeadRepository(
    fixture.databaseFile
  );
  const reviewRepository = new SqliteReviewRepository(
    fixture.databaseFile
  );
  const quoteRepository = new SqliteQuoteRepository(
    fixture.databaseFile
  );

  await leadRepository.insert(createLead());
  await reviewRepository.insert(createReview());
  await quoteRepository.insert(createQuote());

  const firstReview = await reviewRepository
    .findLatestByLeadId("lead-repository-001");
  const staleReview = await reviewRepository
    .findLatestByLeadId("lead-repository-001");

  assert.ok(firstReview);
  assert.ok(staleReview);

  firstReview.status = "approved";
  firstReview.updatedAt = "2026-01-02T00:00:00.000Z";

  staleReview.status = "rejected";
  staleReview.updatedAt = "2026-01-03T00:00:00.000Z";

  assert.equal(
    await reviewRepository.update(
      firstReview,
      "2026-01-01T00:00:00.000Z"
    ),
    true
  );

  assert.equal(
    await reviewRepository.update(
      staleReview,
      "2026-01-01T00:00:00.000Z"
    ),
    false
  );

  const firstQuote = await quoteRepository.findByNumber(
    "Q-20260101-A1B2C3D4"
  );
  const staleQuote = await quoteRepository.findByNumber(
    "Q-20260101-A1B2C3D4"
  );

  assert.ok(firstQuote);
  assert.ok(staleQuote);

  firstQuote.status = "sent";
  firstQuote.updatedAt = "2026-01-02T00:00:00.000Z";
  staleQuote.status = "rejected";
  staleQuote.updatedAt = "2026-01-03T00:00:00.000Z";

  assert.equal(
    await quoteRepository.update(
      firstQuote,
      "2026-01-01T00:00:00.000Z"
    ),
    true
  );

  assert.equal(
    await quoteRepository.update(
      staleQuote,
      "2026-01-01T00:00:00.000Z"
    ),
    false
  );
});
