import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  findLeadById
} from "./leads.ts";

import {
  findLatestReviewByLeadId,
  type CoaStatus
} from "./reviews.ts";

import {
  sqliteQuoteRepository
} from "../repositories/sqlite.ts";

export const QUOTES_FILE = join(
  process.cwd(),
  "data",
  "quotes.json"
);

export type QuoteStatus =
  | "draft"
  | "sent"
  | "negotiating"
  | "accepted"
  | "rejected"
  | "expired";

export type QuoteResponseStatus =
  | "negotiating"
  | "accepted"
  | "rejected";

export type QuoteResponseReason =
  | "price_too_high"
  | "lead_time_too_long"
  | "terms_unacceptable"
  | "no_longer_needed"
  | "competitor_selected"
  | "other";

export type QuoteStatusEvent = {
  from: QuoteStatus | null;
  to: QuoteStatus;
  source: "system" | "admin" | "customer";
  time: string;
  responseReason: QuoteResponseReason | null;
  customerTargetPrice: number | null;
  customerFeedback: string | null;
};

export type QuoteDraft = {
  id: string;
  quoteNumber: string;
  leadId: string;
  reviewId: string;
  status: QuoteStatus;
  product: string;
  purity: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitPriceBasis: string;
  totalPrice: number;
  currency: string;
  incoterm: string;
  deliveryAddress: string;
  leadTimeDays: number;
  coaStatus: CoaStatus;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  responseReason: QuoteResponseReason | null;
  customerTargetPrice: number | null;
  customerFeedback: string | null;
  statusHistory: QuoteStatusEvent[];
  createdAt: string;
  updatedAt: string;
};

export type QuoteResponseInput = {
  response: QuoteResponseStatus;
  responseReason?: QuoteResponseReason | null;
  customerTargetPrice?: number | null;
  customerFeedback?: string | null;
};

export type CustomerQuoteStatus = {
  quoteNumber: string;
  status: QuoteStatus;
  product: string;
  purity: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  unitPriceBasis: string;
  totalPrice: number;
  currency: string;
  incoterm: string;
  deliveryAddress: string;
  leadTimeDays: number;
  coaStatus: CoaStatus;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  responseReason: QuoteResponseReason | null;
  customerTargetPrice: number | null;
};

function normalizeNullableString(
  value: string | null | undefined
) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();

  return normalized === ""
    ? null
    : normalized;
}

async function readQuotes(quotesFile: string) {
  const fileText = await readFile(
    quotesFile,
    "utf-8"
  );

  return JSON.parse(fileText) as QuoteDraft[];
}

async function writeQuotes(
  quotesFile: string,
  quotes: QuoteDraft[]
) {
  await writeFile(
    quotesFile,
    JSON.stringify(quotes, null, 2),
    "utf-8"
  );
}

function createQuoteNumber() {
  const date = new Date()
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");

  const suffix = randomUUID()
    .slice(0, 8)
    .toUpperCase();

  return `Q-${date}-${suffix}`;
}

export async function createQuoteDraft(
  leadId: string,
  leadsFile?: string,
  reviewQueueFile?: string,
  quotesFile?: string
) {
  const lead = await findLeadById(
    leadId,
    leadsFile
  );

  if (!lead) {
    return {
      outcome: "lead_not_found" as const,
      leadId
    };
  }

  const review = await findLatestReviewByLeadId(
    leadId,
    reviewQueueFile
  );

  if (!review) {
    return {
      outcome: "review_not_found" as const,
      leadId
    };
  }

  if (review.status !== "approved") {
    return {
      outcome: "review_not_approved" as const,
      leadId,
      reviewStatus: review.status
    };
  }

  if (
    review.inventoryConfirmed !== true ||
    review.unitPrice === null ||
    review.unitPrice <= 0 ||
    review.currency === null ||
    review.leadTimeDays === null ||
    review.leadTimeDays <= 0 ||
    review.coaStatus === null
  ) {
    throw new Error(
      "已批准的审核任务缺少生成报价所需的信息"
    );
  }

  if (
    lead.product === null ||
    lead.purity === null ||
    lead.quantity === null ||
    lead.quantity <= 0 ||
    lead.unit === null ||
    lead.incoterm === null ||
    lead.deliveryAddress === null
  ) {
    throw new Error(
      "Lead 缺少生成报价所需的信息"
    );
  }

  const existingQuote = quotesFile === undefined
    ? await sqliteQuoteRepository.findByReviewId(
        review.id
      )
    : (await readQuotes(quotesFile)).find(
        (quote) => quote.reviewId === review.id
      );

  if (existingQuote) {
    return {
      outcome: "already_exists" as const,
      quote: existingQuote
    };
  }

  const now = new Date().toISOString();

  const quote: QuoteDraft = {
    id: randomUUID(),
    quoteNumber: createQuoteNumber(),
    leadId,
    reviewId: review.id,
    status: "draft",
    product: lead.product,
    purity: lead.purity,
    quantity: lead.quantity,
    unit: lead.unit,
    unitPrice: review.unitPrice,
    unitPriceBasis: lead.unit,
    totalPrice: Math.round(
      lead.quantity * review.unitPrice * 100
    ) / 100,
    currency: review.currency,
    incoterm: lead.incoterm,
    deliveryAddress: lead.deliveryAddress,
    leadTimeDays: review.leadTimeDays,
    coaStatus: review.coaStatus,
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
        time: now,
        responseReason: null,
        customerTargetPrice: null,
        customerFeedback: null
      }
    ],
    createdAt: now,
    updatedAt: now
  };

  if (quotesFile === undefined) {
    const inserted = await sqliteQuoteRepository.insert(
      quote
    );

    if (!inserted) {
      const concurrentQuote =
        await sqliteQuoteRepository.findByReviewId(
          review.id
        );

      if (concurrentQuote) {
        return {
          outcome: "already_exists" as const,
          quote: concurrentQuote
        };
      }

      throw new Error("报价草稿保存失败");
    }
  } else {
    const quotes = await readQuotes(quotesFile);
    quotes.push(quote);
    await writeQuotes(quotesFile, quotes);
  }

  return {
    outcome: "created" as const,
    quote
  };
}

export async function listQuotes(
  status?: QuoteStatus,
  quotesFile?: string
) {
  if (quotesFile === undefined) {
    return sqliteQuoteRepository.list(status);
  }

  const quotes = await readQuotes(quotesFile);

  return status === undefined
    ? quotes
    : quotes.filter((quote) => quote.status === status);
}

export async function markQuoteSent(
  quoteNumber: string,
  validDays: number,
  quotesFile?: string,
  currentTime = new Date()
) {
  if (!Number.isInteger(validDays) || validDays <= 0) {
    throw new Error("报价有效天数必须是正整数");
  }

  const quotes = quotesFile === undefined
    ? null
    : await readQuotes(quotesFile);

  const quote = quotesFile === undefined
    ? await sqliteQuoteRepository.findByNumber(
        quoteNumber
      )
    : quotes?.find(
        (item) =>
          item.quoteNumber.toLowerCase() ===
          quoteNumber.trim().toLowerCase()
      ) ?? null;

  if (!quote) {
    return {
      outcome: "quote_not_found" as const,
      quoteNumber
    };
  }

  if (quote.status !== "draft") {
    return {
      outcome: "invalid_transition" as const,
      currentStatus: quote.status,
      requestedStatus: "sent" as const
    };
  }

  const sentAt = currentTime.toISOString();
  const expectedUpdatedAt = quote.updatedAt;
  const expiresAt = new Date(
    currentTime.getTime() +
      validDays * 24 * 60 * 60 * 1000
  ).toISOString();

  quote.status = "sent";
  quote.sentAt = sentAt;
  quote.expiresAt = expiresAt;
  quote.updatedAt = sentAt;
  quote.statusHistory.push({
    from: "draft",
    to: "sent",
    source: "admin",
    time: sentAt,
    responseReason: null,
    customerTargetPrice: null,
    customerFeedback: null
  });

  if (quotesFile === undefined) {
    const updated = await sqliteQuoteRepository.update(
      quote,
      expectedUpdatedAt
    );

    if (!updated) {
      return {
        outcome: "conflict" as const,
        quoteNumber: quote.quoteNumber
      };
    }
  } else {
    await writeQuotes(quotesFile, quotes ?? []);
  }

  return {
    outcome: "sent" as const,
    quote
  };
}

export async function recordQuoteResponse(
  quoteNumber: string,
  input: QuoteResponseInput,
  quotesFile?: string,
  currentTime = new Date()
) {
  if (
    input.customerTargetPrice !== undefined &&
    input.customerTargetPrice !== null &&
    input.customerTargetPrice <= 0
  ) {
    throw new Error("客户目标价必须大于 0");
  }

  const customerFeedback = normalizeNullableString(
    input.customerFeedback
  );

  if (
    input.response === "negotiating" &&
    input.customerTargetPrice == null &&
    customerFeedback === null
  ) {
    throw new Error(
      "记录客户还价时必须提供目标价或反馈"
    );
  }

  const quotes = quotesFile === undefined
    ? null
    : await readQuotes(quotesFile);

  const quote = quotesFile === undefined
    ? await sqliteQuoteRepository.findByNumber(
        quoteNumber
      )
    : quotes?.find(
        (item) =>
          item.quoteNumber.toLowerCase() ===
          quoteNumber.trim().toLowerCase()
      ) ?? null;

  if (!quote) {
    return {
      outcome: "quote_not_found" as const,
      quoteNumber
    };
  }

  if (
    quote.status === "accepted" ||
    quote.status === "rejected" ||
    quote.status === "expired"
  ) {
    return {
      outcome: "already_final" as const,
      quote
    };
  }

  if (
    quote.status !== "sent" &&
    quote.status !== "negotiating"
  ) {
    return {
      outcome: "invalid_transition" as const,
      currentStatus: quote.status,
      requestedStatus: input.response
    };
  }

  const previousStatus = quote.status;
  const expectedUpdatedAt = quote.updatedAt;
  const respondedAt = currentTime.toISOString();
  const responseReason =
    input.responseReason ?? null;
  const customerTargetPrice =
    input.customerTargetPrice ?? null;

  quote.status = input.response;
  quote.respondedAt = respondedAt;
  quote.responseReason = responseReason;
  quote.customerTargetPrice = customerTargetPrice;
  quote.customerFeedback = customerFeedback;
  quote.updatedAt = respondedAt;
  quote.statusHistory.push({
    from: previousStatus,
    to: input.response,
    source: "customer",
    time: respondedAt,
    responseReason,
    customerTargetPrice,
    customerFeedback
  });

  if (quotesFile === undefined) {
    const updated = await sqliteQuoteRepository.update(
      quote,
      expectedUpdatedAt
    );

    if (!updated) {
      return {
        outcome: "conflict" as const,
        quoteNumber: quote.quoteNumber
      };
    }
  } else {
    await writeQuotes(quotesFile, quotes ?? []);
  }

  return {
    outcome: "recorded" as const,
    quote
  };
}

export async function expireQuote(
  quoteNumber: string,
  quotesFile?: string,
  currentTime = new Date()
) {
  const quotes = quotesFile === undefined
    ? null
    : await readQuotes(quotesFile);

  const quote = quotesFile === undefined
    ? await sqliteQuoteRepository.findByNumber(
        quoteNumber
      )
    : quotes?.find(
        (item) =>
          item.quoteNumber.toLowerCase() ===
          quoteNumber.trim().toLowerCase()
      ) ?? null;

  if (!quote) {
    return {
      outcome: "quote_not_found" as const,
      quoteNumber
    };
  }

  if (
    quote.status !== "sent" &&
    quote.status !== "negotiating"
  ) {
    return {
      outcome: "invalid_transition" as const,
      currentStatus: quote.status,
      requestedStatus: "expired" as const
    };
  }

  if (
    quote.expiresAt === null ||
    currentTime.getTime() < Date.parse(quote.expiresAt)
  ) {
    return {
      outcome: "not_due" as const,
      quote
    };
  }

  const previousStatus = quote.status;
  const expectedUpdatedAt = quote.updatedAt;
  const expiredAt = currentTime.toISOString();

  quote.status = "expired";
  quote.updatedAt = expiredAt;
  quote.statusHistory.push({
    from: previousStatus,
    to: "expired",
    source: "system",
    time: expiredAt,
    responseReason: null,
    customerTargetPrice: null,
    customerFeedback: null
  });

  if (quotesFile === undefined) {
    const updated = await sqliteQuoteRepository.update(
      quote,
      expectedUpdatedAt
    );

    if (!updated) {
      return {
        outcome: "conflict" as const,
        quoteNumber: quote.quoteNumber
      };
    }
  } else {
    await writeQuotes(quotesFile, quotes ?? []);
  }

  return {
    outcome: "expired" as const,
    quote
  };
}

export async function lookupQuoteStatus(
  quoteNumber: string,
  quotesFile?: string
): Promise<CustomerQuoteStatus | null> {
  const quote = quotesFile === undefined
    ? await sqliteQuoteRepository.findByNumber(
        quoteNumber
      )
    : (await readQuotes(quotesFile)).find(
        (item) =>
          item.quoteNumber.toLowerCase() ===
          quoteNumber.trim().toLowerCase()
      ) ?? null;

  if (!quote) {
    return null;
  }

  return {
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    product: quote.product,
    purity: quote.purity,
    quantity: quote.quantity,
    unit: quote.unit,
    unitPrice: quote.unitPrice,
    unitPriceBasis: quote.unitPriceBasis,
    totalPrice: quote.totalPrice,
    currency: quote.currency,
    incoterm: quote.incoterm,
    deliveryAddress: quote.deliveryAddress,
    leadTimeDays: quote.leadTimeDays,
    coaStatus: quote.coaStatus,
    sentAt: quote.sentAt,
    respondedAt: quote.respondedAt,
    expiresAt: quote.expiresAt,
    responseReason: quote.responseReason,
    customerTargetPrice: quote.customerTargetPrice
  };
}
