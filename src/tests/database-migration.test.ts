import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  initializeDatabase
} from "../db/database.ts";

import {
  migrateJsonToSqlite,
  type JsonMigrationFiles
} from "../db/migrate-json.ts";

async function createMigrationFixture() {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-db-")
  );

  const files: JsonMigrationFiles = {
    leadsFile: join(directory, "leads.json"),
    reviewsFile: join(directory, "reviews.json"),
    quotesFile: join(directory, "quotes.json"),
    agentEventsFile: join(directory, "events.jsonl")
  };

  const lead = {
    id: "lead-db-001",
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

  const review = {
    id: "review-db-001",
    leadId: lead.id,
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
    reviewNotes: null,
    reviewedBy: "sales-admin",
    reviewedAt: "2026-01-02T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z"
  };

  const quote = {
    id: "quote-db-001",
    quoteNumber: "Q-20260102-ABCDEF12",
    leadId: lead.id,
    reviewId: review.id,
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
    customerTargetPrice: null,
    customerFeedback: null,
    statusHistory: [
      {
        from: null,
        to: "draft",
        source: "system",
        time: "2026-01-02T00:00:00.000Z",
        responseReason: null,
        customerTargetPrice: null,
        customerFeedback: null
      },
      {
        from: "draft",
        to: "sent",
        source: "admin",
        time: "2026-01-02T00:01:00.000Z",
        responseReason: null,
        customerTargetPrice: null,
        customerFeedback: null
      }
    ],
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:01:00.000Z"
  };

  await Promise.all([
    writeFile(
      files.leadsFile,
      JSON.stringify([lead]),
      "utf-8"
    ),
    writeFile(
      files.reviewsFile,
      JSON.stringify([review]),
      "utf-8"
    ),
    writeFile(
      files.quotesFile,
      JSON.stringify([quote]),
      "utf-8"
    ),
    writeFile(
      files.agentEventsFile,
      JSON.stringify({
        time: "2026-01-01T00:00:00.000Z",
        toolCallId: "call-db-001",
        toolName: "lookup_product",
        stage: "end",
        status: "success"
      }),
      "utf-8"
    )
  ]);

  return {
    directory,
    databaseFile: join(directory, "dateagent.db"),
    files
  };
}

test("JSON 数据可以在一个事务中迁移到 SQLite", async (t) => {
  const fixture = await createMigrationFixture();

  t.after(async () => {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await migrateJsonToSqlite(
    fixture.databaseFile,
    fixture.files
  );

  assert.deepEqual(result.insertedCounts, {
    leads: 1,
    reviews: 1,
    quotes: 1,
    quoteStatusEvents: 2,
    agentEvents: 1
  });

  const repeatedResult = await migrateJsonToSqlite(
    fixture.databaseFile,
    fixture.files
  );

  assert.deepEqual(repeatedResult.insertedCounts, {
    leads: 0,
    reviews: 0,
    quotes: 0,
    quoteStatusEvents: 0,
    agentEvents: 0
  });

  const database = initializeDatabase(
    fixture.databaseFile
  );

  try {
    const counts = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM leads) AS leads,
        (SELECT COUNT(*) FROM reviews) AS reviews,
        (SELECT COUNT(*) FROM quotes) AS quotes,
        (SELECT COUNT(*) FROM quote_status_events) AS events
    `).get() as {
      leads: number;
      reviews: number;
      quotes: number;
      events: number;
    };

    assert.deepEqual({ ...counts }, {
      leads: 1,
      reviews: 1,
      quotes: 1,
      events: 2
    });

    assert.deepEqual(
      database.prepare("PRAGMA foreign_key_check;").all(),
      []
    );
  } finally {
    database.close();
  }
});

test("数据库约束阻止同一审核产生重复报价", async (t) => {
  const fixture = await createMigrationFixture();

  t.after(async () => {
    await rm(fixture.directory, {
      recursive: true,
      force: true
    });
  });

  await migrateJsonToSqlite(
    fixture.databaseFile,
    fixture.files
  );

  const database = initializeDatabase(
    fixture.databaseFile
  );

  try {
    assert.throws(
      () => database.prepare(`
        INSERT INTO quotes (
          id, quote_number, lead_id, review_id,
          status, product, purity, quantity, unit,
          unit_price, unit_price_basis, total_price,
          currency, incoterm, delivery_address,
          lead_time_days, coa_status,
          created_at, updated_at
        )
        SELECT
          'quote-db-002', 'Q-20260102-99999999',
          lead_id, review_id,
          'draft', product, purity, quantity, unit,
          unit_price, unit_price_basis, total_price,
          currency, incoterm, delivery_address,
          lead_time_days, coa_status,
          created_at, updated_at
        FROM quotes
        WHERE id = 'quote-db-001'
      `).run(),
      /UNIQUE constraint failed/
    );
  } finally {
    database.close();
  }
});
