import {
  findLeadById,
  findLeadsByEmail
} from "../data/leads.ts";

import {
  decideReview,
  listReviewTasks,
  type ReviewDecisionInput,
  type ReviewStatus
} from "../data/reviews.ts";

import {
  lookupQuoteStatus,
  markQuoteSent
} from "../data/quotes.ts";

import {
  initializeDatabase
} from "../db/database.ts";

import {
  ProductKnowledgeApplicationService,
  type ImportProductDocumentInput
} from "./knowledge-service.ts";

import {
  SqliteProductKnowledgeRepository
} from "../repositories/sqlite-knowledge.ts";

export interface DataApplicationService {
  health(): Promise<{
    status: "ok";
    storage: "sqlite";
  }>;
  findLeads(
    email: string,
    product?: string | null
  ): ReturnType<typeof findLeadsByEmail>;
  findLead(
    leadId: string
  ): ReturnType<typeof findLeadById>;
  listReviews(
    status?: ReviewStatus
  ): ReturnType<typeof listReviewTasks>;
  decideReview(
    reviewId: string,
    input: ReviewDecisionInput
  ): ReturnType<typeof decideReview>;
  lookupQuote(
    quoteNumber: string
  ): ReturnType<typeof lookupQuoteStatus>;
  markQuoteSent(
    quoteNumber: string,
    validDays: number
  ): ReturnType<typeof markQuoteSent>;
  importProductDocument(
    input: ImportProductDocumentInput
  ): ReturnType<ProductKnowledgeApplicationService["importDocument"]>;
  listProductDocuments(
    productSku?: string | null
  ): ReturnType<ProductKnowledgeApplicationService["listDocuments"]>;
  searchProductDocuments(
    query: string,
    productSku?: string | null,
    limit?: number
  ): ReturnType<ProductKnowledgeApplicationService["search"]>;
}

export class DefaultDataApplicationService
implements DataApplicationService {
  private readonly knowledge =
    new ProductKnowledgeApplicationService(
      new SqliteProductKnowledgeRepository()
    );

  async health() {
    const database = initializeDatabase();

    try {
      const result = database.prepare(
        "PRAGMA integrity_check;"
      ).get() as { integrity_check: string };

      if (result.integrity_check !== "ok") {
        throw new Error("SQLite 完整性检查失败");
      }

      return {
        status: "ok" as const,
        storage: "sqlite" as const
      };
    } finally {
      database.close();
    }
  }

  findLeads(email: string, product?: string | null) {
    return findLeadsByEmail(email, product);
  }

  findLead(leadId: string) {
    return findLeadById(leadId);
  }

  listReviews(status?: ReviewStatus) {
    return listReviewTasks(status);
  }

  decideReview(
    reviewId: string,
    input: ReviewDecisionInput
  ) {
    return decideReview(reviewId, input);
  }

  lookupQuote(quoteNumber: string) {
    return lookupQuoteStatus(quoteNumber);
  }

  markQuoteSent(
    quoteNumber: string,
    validDays: number
  ) {
    return markQuoteSent(quoteNumber, validDays);
  }

  importProductDocument(input: ImportProductDocumentInput) {
    return this.knowledge.importDocument(input);
  }

  listProductDocuments(productSku?: string | null) {
    return this.knowledge.listDocuments(productSku);
  }

  searchProductDocuments(
    query: string,
    productSku?: string | null,
    limit = 5
  ) {
    return this.knowledge.search(query, productSku, limit);
  }
}
