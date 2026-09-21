import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  initializeDatabase,
  DATABASE_FILE
} from "./database.ts";

import type { Lead } from "../data/leads.ts";
import type { ReviewTask } from "../data/reviews.ts";
import type { QuoteDraft } from "../data/quotes.ts";

export type JsonMigrationFiles = {
  leadsFile: string;
  reviewsFile: string;
  quotesFile: string;
  agentEventsFile: string;
};

type AgentEvent = {
  time: string;
  toolCallId: string;
  toolName: string;
  stage: "start" | "end";
  status: string;
};

export const DEFAULT_JSON_FILES: JsonMigrationFiles = {
  leadsFile: join(process.cwd(), "data", "leads.json"),
  reviewsFile: join(
    process.cwd(),
    "data",
    "review-queue.json"
  ),
  quotesFile: join(process.cwd(), "data", "quotes.json"),
  agentEventsFile: join(
    process.cwd(),
    "data",
    "agent-events.jsonl"
  )
};

async function readJsonArray<T>(file: string) {
  const text = await readFile(file, "utf-8");
  return JSON.parse(text) as T[];
}

async function readJsonLines<T>(file: string) {
  const text = await readFile(file, "utf-8");

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as T);
}

export async function inspectJsonMigration(
  files = DEFAULT_JSON_FILES
) {
  const [leads, reviews, quotes, agentEvents] =
    await Promise.all([
      readJsonArray<Lead>(files.leadsFile),
      readJsonArray<ReviewTask>(files.reviewsFile),
      readJsonArray<QuoteDraft>(files.quotesFile),
      readJsonLines<AgentEvent>(files.agentEventsFile)
    ]);

  return {
    leads,
    reviews,
    quotes,
    agentEvents,
    counts: {
      leads: leads.length,
      reviews: reviews.length,
      quotes: quotes.length,
      quoteStatusEvents: quotes.reduce(
        (total, quote) =>
          total + quote.statusHistory.length,
        0
      ),
      agentEvents: agentEvents.length
    }
  };
}

export async function migrateJsonToSqlite(
  databaseFile = DATABASE_FILE,
  files = DEFAULT_JSON_FILES
) {
  const source = await inspectJsonMigration(files);
  const database = initializeDatabase(databaseFile);

  const insertLead = database.prepare(`
    INSERT OR IGNORE INTO leads (
      id, name, contact_email, company, country,
      product, quantity, unit, purity,
      delivery_address, incoterm,
      request_coa, request_quote,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?
    )
  `);

  const insertReview = database.prepare(`
    INSERT OR IGNORE INTO reviews (
      id, lead_id, status, inventory_confirmed,
      unit_price, currency, lead_time_days,
      coa_status, review_notes, reviewed_by,
      reviewed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertReviewCheck = database.prepare(`
    INSERT OR IGNORE INTO review_requested_checks (
      review_id, check_name
    ) VALUES (?, ?)
  `);

  const insertQuote = database.prepare(`
    INSERT OR IGNORE INTO quotes (
      id, quote_number, lead_id, review_id, status,
      product, purity, quantity, unit,
      unit_price, unit_price_basis, total_price,
      currency, incoterm, delivery_address,
      lead_time_days, coa_status,
      sent_at, responded_at, expires_at,
      response_reason, customer_target_price,
      customer_feedback, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const insertQuoteEvent = database.prepare(`
    INSERT OR IGNORE INTO quote_status_events (
      quote_id, from_status, to_status, source,
      event_time, response_reason,
      customer_target_price, customer_feedback
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAgentEvent = database.prepare(`
    INSERT OR IGNORE INTO agent_events (
      event_time, tool_call_id, tool_name,
      stage, status
    ) VALUES (?, ?, ?, ?, ?)
  `);

  let insertedLeads = 0;
  let insertedReviews = 0;
  let insertedQuotes = 0;
  let insertedQuoteStatusEvents = 0;
  let insertedAgentEvents = 0;

  try {
    database.exec("BEGIN IMMEDIATE;");

    for (const lead of source.leads) {
      const result = insertLead.run(
        lead.id,
        lead.name,
        lead.contactEmail,
        lead.company,
        lead.country,
        lead.product,
        lead.quantity,
        lead.unit,
        lead.purity,
        lead.deliveryAddress,
        lead.incoterm,
        Number(lead.requestCoa),
        Number(lead.requestQuote),
        lead.createdAt,
        lead.updatedAt
      );

      insertedLeads += Number(result.changes);
    }

    for (const review of source.reviews) {
      const result = insertReview.run(
        review.id,
        review.leadId,
        review.status,
        review.inventoryConfirmed === null
          ? null
          : Number(review.inventoryConfirmed),
        review.unitPrice,
        review.currency,
        review.leadTimeDays,
        review.coaStatus,
        review.reviewNotes,
        review.reviewedBy,
        review.reviewedAt,
        review.createdAt,
        review.updatedAt
      );

      insertedReviews += Number(result.changes);

      for (const check of review.requestedChecks) {
        insertReviewCheck.run(review.id, check);
      }
    }

    for (const quote of source.quotes) {
      const result = insertQuote.run(
        quote.id,
        quote.quoteNumber,
        quote.leadId,
        quote.reviewId,
        quote.status,
        quote.product,
        quote.purity,
        quote.quantity,
        quote.unit,
        quote.unitPrice,
        quote.unitPriceBasis,
        quote.totalPrice,
        quote.currency,
        quote.incoterm,
        quote.deliveryAddress,
        quote.leadTimeDays,
        quote.coaStatus,
        quote.sentAt,
        quote.respondedAt,
        quote.expiresAt,
        quote.responseReason,
        quote.customerTargetPrice,
        quote.customerFeedback,
        quote.createdAt,
        quote.updatedAt
      );

      insertedQuotes += Number(result.changes);

      for (const event of quote.statusHistory) {
        const eventResult = insertQuoteEvent.run(
          quote.id,
          event.from,
          event.to,
          event.source,
          event.time,
          event.responseReason,
          event.customerTargetPrice,
          event.customerFeedback
        );

        insertedQuoteStatusEvents += Number(
          eventResult.changes
        );
      }
    }

    for (const event of source.agentEvents) {
      const result = insertAgentEvent.run(
        event.time,
        event.toolCallId,
        event.toolName,
        event.stage,
        event.status
      );

      insertedAgentEvents += Number(result.changes);
    }

    database.prepare(`
      INSERT OR REPLACE INTO schema_migrations (
        version,
        applied_at
      ) VALUES (?, ?)
    `).run(
      "json-import-v1",
      new Date().toISOString()
    );

    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  } finally {
    database.close();
  }

  return {
    sourceCounts: source.counts,
    insertedCounts: {
      leads: insertedLeads,
      reviews: insertedReviews,
      quotes: insertedQuotes,
      quoteStatusEvents: insertedQuoteStatusEvents,
      agentEvents: insertedAgentEvents
    }
  };
}
