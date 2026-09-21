import {
  DATABASE_FILE,
  initializeDatabase
} from "../db/database.ts";

import type {
  ProductDocument,
  ProductDocumentChunk,
  ProductDocumentType,
  ProductKnowledgeMatch,
  ProductKnowledgeRepository
} from "../knowledge/types.ts";

type Row = Record<string, unknown>;

function mapDocument(row: Row): ProductDocument {
  return {
    id: String(row.id),
    productSku: String(row.product_sku),
    documentType: row.document_type as ProductDocumentType,
    title: String(row.title),
    originalFilename: String(row.original_filename),
    mimeType: String(row.mime_type),
    checksumSha256: String(row.checksum_sha256),
    version: Number(row.version),
    status: row.status as ProductDocument["status"],
    characterCount: Number(row.character_count),
    chunkCount: Number(row.chunk_count),
    createdAt: String(row.created_at)
  };
}

function buildFtsQuery(query: string) {
  const terms = query.match(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu)
    ?.slice(0, 12) ?? [];

  return terms
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" OR ");
}

export class SqliteProductKnowledgeRepository
implements ProductKnowledgeRepository {
  constructor(
    private readonly databaseFile = DATABASE_FILE
  ) {}

  async findDocumentByChecksum(checksumSha256: string) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const row = database.prepare(`
        SELECT * FROM product_documents
        WHERE checksum_sha256 = ?
      `).get(checksumSha256) as Row | undefined;

      return row ? mapDocument(row) : null;
    } finally {
      database.close();
    }
  }

  async importDocument(
    document: Omit<ProductDocument, "version" | "status">,
    chunks: ProductDocumentChunk[]
  ) {
    const database = initializeDatabase(this.databaseFile);

    try {
      database.exec("BEGIN IMMEDIATE;");

      const duplicate = database.prepare(`
        SELECT * FROM product_documents
        WHERE checksum_sha256 = ?
      `).get(document.checksumSha256) as Row | undefined;

      if (duplicate) {
        database.exec("COMMIT;");
        return mapDocument(duplicate);
      }

      const versionRow = database.prepare(`
        SELECT coalesce(max(version), 0) + 1 AS next_version
        FROM product_documents
        WHERE lower(product_sku) = lower(?)
          AND lower(original_filename) = lower(?)
      `).get(
        document.productSku,
        document.originalFilename
      ) as { next_version: number };

      const version = Number(versionRow.next_version);

      database.prepare(`
        UPDATE product_documents
        SET status = 'superseded'
        WHERE lower(product_sku) = lower(?)
          AND lower(original_filename) = lower(?)
          AND status = 'active'
      `).run(
        document.productSku,
        document.originalFilename
      );

      database.prepare(`
        INSERT INTO product_documents (
          id, product_sku, document_type, title,
          original_filename, mime_type, checksum_sha256,
          version, status, character_count,
          chunk_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
      `).run(
        document.id,
        document.productSku,
        document.documentType,
        document.title,
        document.originalFilename,
        document.mimeType,
        document.checksumSha256,
        version,
        document.characterCount,
        document.chunkCount,
        document.createdAt
      );

      const insertChunk = database.prepare(`
        INSERT INTO product_document_chunks (
          id, document_id, chunk_index, content,
          character_count
        ) VALUES (?, ?, ?, ?, ?)
      `);

      const insertFts = database.prepare(`
        INSERT INTO product_document_chunks_fts (
          chunk_id, document_id, product_sku, content
        ) VALUES (?, ?, ?, ?)
      `);

      for (const chunk of chunks) {
        insertChunk.run(
          chunk.id,
          document.id,
          chunk.chunkIndex,
          chunk.content,
          chunk.characterCount
        );
        insertFts.run(
          chunk.id,
          document.id,
          document.productSku,
          chunk.content
        );
      }

      database.exec("COMMIT;");

      return {
        ...document,
        version,
        status: "active" as const
      };
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    } finally {
      database.close();
    }
  }

  async listDocuments(productSku?: string | null) {
    const database = initializeDatabase(this.databaseFile);

    try {
      const rows = productSku
        ? database.prepare(`
            SELECT * FROM product_documents
            WHERE lower(product_sku) = lower(?)
            ORDER BY created_at DESC
          `).all(productSku)
        : database.prepare(`
            SELECT * FROM product_documents
            ORDER BY created_at DESC
            LIMIT 100
          `).all();

      return (rows as Row[]).map(mapDocument);
    } finally {
      database.close();
    }
  }

  async search(
    query: string,
    productSku?: string | null,
    limit = 5
  ): Promise<ProductKnowledgeMatch[]> {
    const database = initializeDatabase(this.databaseFile);

    try {
      const ftsQuery = buildFtsQuery(query);

      if (!ftsQuery) {
        return [];
      }

      const rows = database.prepare(`
        SELECT
          d.id AS document_id,
          d.product_sku,
          d.document_type,
          d.title,
          d.original_filename,
          d.version,
          c.chunk_index,
          c.content,
          bm25(product_document_chunks_fts) AS rank
        FROM product_document_chunks_fts
        JOIN product_document_chunks c
          ON c.id = product_document_chunks_fts.chunk_id
        JOIN product_documents d
          ON d.id = c.document_id
        WHERE product_document_chunks_fts MATCH ?
          AND d.status = 'active'
          AND (? IS NULL OR lower(d.product_sku) = lower(?))
        ORDER BY rank, d.created_at DESC
        LIMIT ?
      `).all(
        ftsQuery,
        productSku ?? null,
        productSku ?? null,
        Math.max(1, Math.min(limit, 10))
      ) as Row[];

      return rows.map((row) => ({
        documentId: String(row.document_id),
        productSku: String(row.product_sku),
        documentType:
          row.document_type as ProductDocumentType,
        title: String(row.title),
        originalFilename: String(row.original_filename),
        version: Number(row.version),
        chunkIndex: Number(row.chunk_index),
        content: String(row.content),
        score: Math.abs(Number(row.rank))
      }));
    } finally {
      database.close();
    }
  }
}
