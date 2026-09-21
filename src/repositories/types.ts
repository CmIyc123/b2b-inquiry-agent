import type {
  Lead,
  LeadUpdate
} from "../data/leads.ts";

import type {
  ReviewStatus,
  ReviewTask
} from "../data/reviews.ts";

import type {
  QuoteDraft,
  QuoteStatus
} from "../data/quotes.ts";

export type AgentToolEvent = {
  time: string;
  toolCallId: string;
  toolName: string;
  stage: "start" | "end";
  status: string;
};

export interface LeadRepository {
  insert(lead: Lead): Promise<void>;
  update(
    leadId: string,
    updates: LeadUpdate,
    updatedAt: string
  ): Promise<Lead | null>;
  findById(leadId: string): Promise<Lead | null>;
  findByEmail(
    contactEmail: string,
    product?: string | null
  ): Promise<Lead[]>;
}

export interface ReviewRepository {
  insert(review: ReviewTask): Promise<boolean>;
  update(
    review: ReviewTask,
    expectedUpdatedAt: string
  ): Promise<boolean>;
  list(status?: ReviewStatus): Promise<ReviewTask[]>;
  findLatestByLeadId(
    leadId: string
  ): Promise<ReviewTask | null>;
  findPendingByLeadId(
    leadId: string
  ): Promise<ReviewTask | null>;
}

export interface QuoteRepository {
  insert(quote: QuoteDraft): Promise<boolean>;
  update(
    quote: QuoteDraft,
    expectedUpdatedAt: string
  ): Promise<boolean>;
  list(status?: QuoteStatus): Promise<QuoteDraft[]>;
  findByNumber(
    quoteNumber: string
  ): Promise<QuoteDraft | null>;
  findByReviewId(
    reviewId: string
  ): Promise<QuoteDraft | null>;
}

export interface AgentEventRepository {
  insert(event: AgentToolEvent): Promise<void>;
}
