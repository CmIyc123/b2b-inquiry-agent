import {
  DATABASE_FILE,
  initializeDatabase
} from "../db/database.ts";

import type {
  Lead,
  LeadUpdate
} from "../data/leads.ts";

import type {
  RequestedCheck,
  ReviewStatus,
  ReviewTask
} from "../data/reviews.ts";

import type {
  QuoteDraft,
  QuoteStatus,
  QuoteStatusEvent
} from "../data/quotes.ts";

import type {
  AgentEventRepository,
  AgentToolEvent,
  LeadRepository,
  QuoteRepository,
  ReviewRepository
} from "./types.ts";

type Row = Record<string, unknown>;

function nullableBoolean(value: unknown) {
  return value === null
    ? null
    : Boolean(value);
}

function mapLead(row: Row): Lead {
  return {
    id: String(row.id),
    name: row.name as string | null,
    contactEmail: row.contact_email as string | null,
    company: row.company as string | null,
    country: row.country as string | null,
    product: row.product as string | null,
    quantity: row.quantity as number | null,
    unit: row.unit as string | null,
    purity: row.purity as string | null,
    deliveryAddress:
      row.delivery_address as string | null,
    incoterm: row.incoterm as string | null,
    requestCoa: Boolean(row.request_coa),
    requestQuote: Boolean(row.request_quote),
    createdAt: row.created_at as string | null,
    updatedAt: row.updated_at as string | null
  };
}

function mapReview(
  row: Row,
  requestedChecks: RequestedCheck[]
): ReviewTask {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    status: row.status as ReviewStatus,
    requestedChecks,
    inventoryConfirmed: nullableBoolean(
      row.inventory_confirmed
    ),
    unitPrice: row.unit_price as number | null,
    currency: row.currency as string | null,
    leadTimeDays: row.lead_time_days as number | null,
    coaStatus: row.coa_status as ReviewTask["coaStatus"],
    reviewNotes: row.review_notes as string | null,
    reviewedBy: row.reviewed_by as string | null,
    reviewedAt: row.reviewed_at as string | null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapQuote(
  row: Row,
  statusHistory: QuoteStatusEvent[]
): QuoteDraft {
  return {
    id: String(row.id),
    quoteNumber: String(row.quote_number),
    leadId: String(row.lead_id),
    reviewId: String(row.review_id),
    status: row.status as QuoteStatus,
    product: String(row.product),
    purity: String(row.purity),
    quantity: Number(row.quantity),
    unit: String(row.unit),
    unitPrice: Number(row.unit_price),
    unitPriceBasis: String(row.unit_price_basis),
    totalPrice: Number(row.total_price),
    currency: String(row.currency),
    incoterm: String(row.incoterm),
    deliveryAddress: String(row.delivery_address),
    leadTimeDays: Number(row.lead_time_days),
    coaStatus: row.coa_status as QuoteDraft["coaStatus"],
    sentAt: row.sent_at as string | null,
    respondedAt: row.responded_at as string | null,
    expiresAt: row.expires_at as string | null,
    responseReason:
      row.response_reason as QuoteDraft["responseReason"],
    customerTargetPrice:
      row.customer_target_price as number | null,
    customerFeedback:
      row.customer_feedback as string | null,
    statusHistory,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export class SqliteLeadRepository
implements LeadRepository {
  constructor(
    private readonly databaseFile = DATABASE_FILE
  ) {}

  async insert(lead: Lead) {
    const database = initializeDatabase(this.databaseFile);

    try {
      database.prepare(`
        INSERT INTO leads (
          id, name, contact_email, company, country,
          product, quantity, unit, purity,
          delivery_address, incoterm,
          request_coa, request_quote,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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
    } finally {
      database.close();
    }
  }

  async update(
    leadId: string,
    updates: LeadUpdate,
    updatedAt: string
  ) {
    const existing = await this.findById(leadId);

    if (!existing) {
      return null;
    }

    const database = initializeDatabase(this.databaseFile);

    try {
      database.prepare(`
        UPDATE leads
        SET contact_email = CASE
              WHEN ? = 1 THEN ? ELSE contact_email
            END,
            delivery_address = CASE
              WHEN ? = 1 THEN ? ELSE delivery_address
            END,
            incoterm = CASE
              WHEN ? = 1 THEN ? ELSE incoterm
            END,
            updated_at = ?
        WHERE id = ?
      `).run(
        Number(updates.contactEmail !== undefined),
        updates.contactEmail ?? null,
        Number(updates.deliveryAddress !== undefined),
        updates.deliveryAddress ?? null,
        Number(updates.incoterm !== undefined),
        updates.incoterm ?? null,
        updatedAt,
        leadId
      );
    } finally {
      database.close();
    }

    return this.findById(leadId);
  }

  async findById(leadId: string) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const row = database.prepare(
        "SELECT * FROM leads WHERE id = ?"
      ).get(leadId) as Row | undefined;

      return row ? mapLead(row) : null;
    } finally {
      database.close();
    }
  }

  async findByEmail(
    contactEmail: string,
    product?: string | null
  ) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const rows = product == null
        ? database.prepare(`
            SELECT * FROM leads
            WHERE lower(contact_email) = lower(?)
            ORDER BY coalesce(updated_at, created_at, '') DESC
            LIMIT 5
          `).all(contactEmail)
        : database.prepare(`
            SELECT * FROM leads
            WHERE lower(contact_email) = lower(?)
              AND lower(product) = lower(?)
            ORDER BY coalesce(updated_at, created_at, '') DESC
            LIMIT 5
          `).all(contactEmail, product);

      return (rows as Row[]).map(mapLead);
    } finally {
      database.close();
    }
  }
}

export class SqliteReviewRepository
implements ReviewRepository {
  constructor(
    private readonly databaseFile = DATABASE_FILE
  ) {}

  private loadChecks(
    database: ReturnType<typeof initializeDatabase>,
    reviewId: string
  ) {
    const rows = database.prepare(`
      SELECT check_name
      FROM review_requested_checks
      WHERE review_id = ?
      ORDER BY rowid
    `).all(reviewId) as Array<{ check_name: RequestedCheck }>;

    return rows.map((row) => row.check_name);
  }

  private mapRows(
    database: ReturnType<typeof initializeDatabase>,
    rows: Row[]
  ) {
    return rows.map((row) =>
      mapReview(
        row,
        this.loadChecks(database, String(row.id))
      )
    );
  }

  async insert(review: ReviewTask) {
    const database = initializeDatabase(this.databaseFile);

    try {
      database.exec("BEGIN IMMEDIATE;");

      const result = database.prepare(`
        INSERT OR IGNORE INTO reviews (
          id, lead_id, status, inventory_confirmed,
          unit_price, currency, lead_time_days,
          coa_status, review_notes, reviewed_by,
          reviewed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
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

      if (Number(result.changes) === 1) {
        const insertCheck = database.prepare(`
          INSERT INTO review_requested_checks (
            review_id,
            check_name
          ) VALUES (?, ?)
        `);

        for (const check of review.requestedChecks) {
          insertCheck.run(review.id, check);
        }
      }

      database.exec("COMMIT;");
      return Number(result.changes) === 1;
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    } finally {
      database.close();
    }
  }

  async update(
    review: ReviewTask,
    expectedUpdatedAt: string
  ) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const result = database.prepare(`
        UPDATE reviews
        SET status = ?,
            inventory_confirmed = ?,
            unit_price = ?,
            currency = ?,
            lead_time_days = ?,
            coa_status = ?,
            review_notes = ?,
            reviewed_by = ?,
            reviewed_at = ?,
            updated_at = ?
        WHERE id = ? AND updated_at = ?
      `).run(
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
        review.updatedAt,
        review.id,
        expectedUpdatedAt
      );

      return Number(result.changes) === 1;
    } finally {
      database.close();
    }
  }

  async list(status?: ReviewStatus) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const rows = status === undefined
        ? database.prepare(`
            SELECT * FROM reviews
            ORDER BY updated_at DESC
          `).all()
        : database.prepare(`
            SELECT * FROM reviews
            WHERE status = ?
            ORDER BY updated_at DESC
          `).all(status);

      return this.mapRows(database, rows as Row[]);
    } finally {
      database.close();
    }
  }

  async findLatestByLeadId(leadId: string) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const row = database.prepare(`
        SELECT * FROM reviews
        WHERE lead_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(leadId) as Row | undefined;

      return row
        ? mapReview(
            row,
            this.loadChecks(database, String(row.id))
          )
        : null;
    } finally {
      database.close();
    }
  }

  async findPendingByLeadId(leadId: string) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const row = database.prepare(`
        SELECT * FROM reviews
        WHERE lead_id = ? AND status = 'pending'
        LIMIT 1
      `).get(leadId) as Row | undefined;

      return row
        ? mapReview(
            row,
            this.loadChecks(database, String(row.id))
          )
        : null;
    } finally {
      database.close();
    }
  }
}

export class SqliteQuoteRepository
implements QuoteRepository {
  constructor(
    private readonly databaseFile = DATABASE_FILE
  ) {}

  private loadEvents(
    database: ReturnType<typeof initializeDatabase>,
    quoteId: string
  ) {
    const rows = database.prepare(`
      SELECT * FROM quote_status_events
      WHERE quote_id = ?
      ORDER BY id
    `).all(quoteId) as Row[];

    return rows.map((row): QuoteStatusEvent => ({
      from: row.from_status as QuoteStatus | null,
      to: row.to_status as QuoteStatus,
      source: row.source as QuoteStatusEvent["source"],
      time: String(row.event_time),
      responseReason:
        row.response_reason as QuoteStatusEvent["responseReason"],
      customerTargetPrice:
        row.customer_target_price as number | null,
      customerFeedback:
        row.customer_feedback as string | null
    }));
  }

  private mapRow(
    database: ReturnType<typeof initializeDatabase>,
    row: Row
  ) {
    return mapQuote(
      row,
      this.loadEvents(database, String(row.id))
    );
  }

  private insertEvents(
    database: ReturnType<typeof initializeDatabase>,
    quote: QuoteDraft
  ) {
    const statement = database.prepare(`
      INSERT OR IGNORE INTO quote_status_events (
        quote_id, from_status, to_status, source,
        event_time, response_reason,
        customer_target_price, customer_feedback
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const event of quote.statusHistory) {
      statement.run(
        quote.id,
        event.from,
        event.to,
        event.source,
        event.time,
        event.responseReason,
        event.customerTargetPrice,
        event.customerFeedback
      );
    }
  }

  async insert(quote: QuoteDraft) {
    const database = initializeDatabase(this.databaseFile);

    try {
      database.exec("BEGIN IMMEDIATE;");

      const result = database.prepare(`
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
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `).run(
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

      if (Number(result.changes) === 1) {
        this.insertEvents(database, quote);
      }

      database.exec("COMMIT;");
      return Number(result.changes) === 1;
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    } finally {
      database.close();
    }
  }

  async update(
    quote: QuoteDraft,
    expectedUpdatedAt: string
  ) {
    const database = initializeDatabase(this.databaseFile);

    try {
      database.exec("BEGIN IMMEDIATE;");

      const result = database.prepare(`
        UPDATE quotes
        SET status = ?,
            sent_at = ?,
            responded_at = ?,
            expires_at = ?,
            response_reason = ?,
            customer_target_price = ?,
            customer_feedback = ?,
            updated_at = ?
        WHERE id = ? AND updated_at = ?
      `).run(
        quote.status,
        quote.sentAt,
        quote.respondedAt,
        quote.expiresAt,
        quote.responseReason,
        quote.customerTargetPrice,
        quote.customerFeedback,
        quote.updatedAt,
        quote.id,
        expectedUpdatedAt
      );

      if (Number(result.changes) !== 1) {
        database.exec("ROLLBACK;");
        return false;
      }

      this.insertEvents(database, quote);
      database.exec("COMMIT;");
      return true;
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    } finally {
      database.close();
    }
  }

  async list(status?: QuoteStatus) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const rows = status === undefined
        ? database.prepare(`
            SELECT * FROM quotes ORDER BY updated_at DESC
          `).all()
        : database.prepare(`
            SELECT * FROM quotes
            WHERE status = ?
            ORDER BY updated_at DESC
          `).all(status);

      return (rows as Row[]).map((row) =>
        this.mapRow(database, row)
      );
    } finally {
      database.close();
    }
  }

  async findByNumber(quoteNumber: string) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const row = database.prepare(`
        SELECT * FROM quotes
        WHERE lower(quote_number) = lower(?)
        LIMIT 1
      `).get(quoteNumber.trim()) as Row | undefined;

      return row ? this.mapRow(database, row) : null;
    } finally {
      database.close();
    }
  }

  async findByReviewId(reviewId: string) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const row = database.prepare(`
        SELECT * FROM quotes
        WHERE review_id = ?
        LIMIT 1
      `).get(reviewId) as Row | undefined;

      return row ? this.mapRow(database, row) : null;
    } finally {
      database.close();
    }
  }
}

export class SqliteAgentEventRepository
implements AgentEventRepository {
  constructor(
    private readonly databaseFile = DATABASE_FILE
  ) {}

  async insert(event: AgentToolEvent) {
    const database = initializeDatabase(this.databaseFile);

    try {
      database.prepare(`
        INSERT OR IGNORE INTO agent_events (
          event_time, tool_call_id, tool_name,
          stage, status
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        event.time,
        event.toolCallId,
        event.toolName,
        event.stage,
        event.status
      );
    } finally {
      database.close();
    }
  }
}

export const sqliteLeadRepository =
  new SqliteLeadRepository();

export const sqliteReviewRepository =
  new SqliteReviewRepository();

export const sqliteQuoteRepository =
  new SqliteQuoteRepository();

export const sqliteAgentEventRepository =
  new SqliteAgentEventRepository();
