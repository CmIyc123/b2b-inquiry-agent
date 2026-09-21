import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

export const DATABASE_FILE = join(
  process.cwd(),
  "data",
  "dateagent.db"
);

export function openDatabase(
  databaseFile = DATABASE_FILE
) {
  mkdirSync(dirname(databaseFile), {
    recursive: true
  });

  const database = new DatabaseSync(databaseFile);

  database.exec("PRAGMA foreign_keys = ON;");
  database.exec("PRAGMA journal_mode = WAL;");
  database.exec("PRAGMA busy_timeout = 5000;");

  return database;
}

export function initializeDatabase(
  databaseFile = DATABASE_FILE
) {
  const database = openDatabase(databaseFile);

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT,
      contact_email TEXT,
      company TEXT,
      country TEXT,
      product TEXT,
      quantity REAL,
      unit TEXT,
      purity TEXT,
      delivery_address TEXT,
      incoterm TEXT,
      request_coa INTEGER NOT NULL
        CHECK (request_coa IN (0, 1)),
      request_quote INTEGER NOT NULL
        CHECK (request_quote IN (0, 1)),
      created_at TEXT,
      updated_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_leads_contact_email
      ON leads(contact_email);

    CREATE INDEX IF NOT EXISTS idx_leads_email_product
      ON leads(contact_email, product);

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      status TEXT NOT NULL
        CHECK (status IN ('pending', 'approved', 'rejected')),
      inventory_confirmed INTEGER
        CHECK (inventory_confirmed IN (0, 1)),
      unit_price REAL,
      currency TEXT,
      lead_time_days INTEGER,
      coa_status TEXT
        CHECK (
          coa_status IS NULL OR
          coa_status IN (
            'available',
            'unavailable',
            'not_requested'
          )
        ),
      review_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_reviews_lead_id
      ON reviews(lead_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_pending_review_per_lead
      ON reviews(lead_id)
      WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS review_requested_checks (
      review_id TEXT NOT NULL,
      check_name TEXT NOT NULL
        CHECK (
          check_name IN (
            'inventory',
            'pricing',
            'lead_time',
            'coa'
          )
        ),
      PRIMARY KEY (review_id, check_name),
      FOREIGN KEY (review_id) REFERENCES reviews(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quotes (
      id TEXT PRIMARY KEY,
      quote_number TEXT NOT NULL UNIQUE,
      lead_id TEXT NOT NULL,
      review_id TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL
        CHECK (
          status IN (
            'draft',
            'sent',
            'negotiating',
            'accepted',
            'rejected',
            'expired'
          )
        ),
      product TEXT NOT NULL,
      purity TEXT NOT NULL,
      quantity REAL NOT NULL CHECK (quantity > 0),
      unit TEXT NOT NULL,
      unit_price REAL NOT NULL CHECK (unit_price > 0),
      unit_price_basis TEXT NOT NULL,
      total_price REAL NOT NULL CHECK (total_price > 0),
      currency TEXT NOT NULL,
      incoterm TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      lead_time_days INTEGER NOT NULL CHECK (lead_time_days > 0),
      coa_status TEXT NOT NULL
        CHECK (
          coa_status IN (
            'available',
            'unavailable',
            'not_requested'
          )
        ),
      sent_at TEXT,
      responded_at TEXT,
      expires_at TEXT,
      response_reason TEXT
        CHECK (
          response_reason IS NULL OR
          response_reason IN (
            'price_too_high',
            'lead_time_too_long',
            'terms_unacceptable',
            'no_longer_needed',
            'competitor_selected',
            'other'
          )
        ),
      customer_target_price REAL
        CHECK (
          customer_target_price IS NULL OR
          customer_target_price > 0
        ),
      customer_feedback TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (lead_id) REFERENCES leads(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,
      FOREIGN KEY (review_id) REFERENCES reviews(id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_quotes_lead_id
      ON quotes(lead_id);

    CREATE INDEX IF NOT EXISTS idx_quotes_status
      ON quotes(status);

    CREATE TABLE IF NOT EXISTS quote_status_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      source TEXT NOT NULL
        CHECK (source IN ('system', 'admin', 'customer')),
      event_time TEXT NOT NULL,
      response_reason TEXT,
      customer_target_price REAL,
      customer_feedback TEXT,
      FOREIGN KEY (quote_id) REFERENCES quotes(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
      UNIQUE (quote_id, event_time, to_status)
    );

    CREATE INDEX IF NOT EXISTS idx_quote_events_quote_id
      ON quote_status_events(quote_id);

    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_time TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      stage TEXT NOT NULL
        CHECK (stage IN ('start', 'end')),
      status TEXT NOT NULL,
      UNIQUE (tool_call_id, stage)
    );

    CREATE INDEX IF NOT EXISTS idx_agent_events_tool_name
      ON agent_events(tool_name);

    CREATE TABLE IF NOT EXISTS channel_contacts (
      channel TEXT NOT NULL,
      external_contact_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (channel, external_contact_id)
    );

    CREATE TABLE IF NOT EXISTS channel_messages (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      external_message_id TEXT NOT NULL,
      external_contact_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      direction TEXT NOT NULL
        CHECK (direction IN ('inbound', 'outbound')),
      status TEXT NOT NULL
        CHECK (
          status IN (
            'received',
            'processing',
            'completed',
            'failed'
          )
        ),
      received_at TEXT NOT NULL,
      processed_at TEXT,
      error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (channel, external_message_id),
      FOREIGN KEY (channel, external_contact_id)
        REFERENCES channel_contacts(channel, external_contact_id)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_channel_messages_contact
      ON channel_messages(channel, external_contact_id);

    CREATE INDEX IF NOT EXISTS idx_channel_messages_status
      ON channel_messages(status, updated_at);

    CREATE TABLE IF NOT EXISTS product_documents (
      id TEXT PRIMARY KEY,
      product_sku TEXT NOT NULL,
      document_type TEXT NOT NULL
        CHECK (
          document_type IN (
            'brochure',
            'tds',
            'sds',
            'coa_template',
            'manual',
            'other'
          )
        ),
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      checksum_sha256 TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL CHECK (version > 0),
      status TEXT NOT NULL
        CHECK (status IN ('active', 'superseded')),
      character_count INTEGER NOT NULL
        CHECK (character_count >= 0),
      chunk_count INTEGER NOT NULL
        CHECK (chunk_count >= 0),
      created_at TEXT NOT NULL,
      UNIQUE (product_sku, original_filename, version)
    );

    CREATE INDEX IF NOT EXISTS idx_product_documents_product
      ON product_documents(product_sku, status, created_at);

    CREATE TABLE IF NOT EXISTS product_document_chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
      content TEXT NOT NULL,
      character_count INTEGER NOT NULL
        CHECK (character_count > 0),
      FOREIGN KEY (document_id) REFERENCES product_documents(id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
      UNIQUE (document_id, chunk_index)
    );

    CREATE INDEX IF NOT EXISTS idx_product_chunks_document
      ON product_document_chunks(document_id, chunk_index);

    CREATE VIRTUAL TABLE IF NOT EXISTS product_document_chunks_fts
      USING fts5(
        chunk_id UNINDEXED,
        document_id UNINDEXED,
        product_sku UNINDEXED,
        content,
        tokenize = 'unicode61 remove_diacritics 2'
      );
  `);

  return database;
}
