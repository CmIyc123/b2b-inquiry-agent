import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  evaluateLeadReadiness,
  findLeadById
} from "./leads.ts";

import {
  sqliteReviewRepository
} from "../repositories/sqlite.ts";

export const REVIEW_QUEUE_FILE = join(
  process.cwd(),
  "data",
  "review-queue.json"
);

export type ReviewStatus =
  | "pending"
  | "approved"
  | "rejected";

export type RequestedCheck =
  | "inventory"
  | "pricing"
  | "lead_time"
  | "coa";

export type CoaStatus =
  | "available"
  | "unavailable"
  | "not_requested";

export type ReviewTask = {
  id: string;
  leadId: string;
  status: ReviewStatus;
  requestedChecks: RequestedCheck[];
  inventoryConfirmed: boolean | null;
  unitPrice: number | null;
  currency: string | null;
  leadTimeDays: number | null;
  coaStatus: CoaStatus | null;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewDecisionInput = {
  decision: "approved" | "rejected";
  inventoryConfirmed: boolean | null;
  unitPrice: number | null;
  currency: string | null;
  leadTimeDays: number | null;
  coaStatus: CoaStatus | null;
  reviewNotes: string | null;
  reviewedBy: string;
};

export type CustomerReviewStatus =
  | {
      status: "not_found";
      leadId: string;
    }
  | {
      status: "pending";
      leadId: string;
    }
  | {
      status: "approved";
      leadId: string;
      inventoryConfirmed: boolean;
      unitPrice: number;
      currency: string;
      leadTimeDays: number;
      coaStatus: CoaStatus;
    }
  | {
      status: "rejected";
      leadId: string;
    };

function normalizeNullableString(
  value: string | null
) {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized === ""
    ? null
    : normalized;
}

export async function requestHumanReview(
  leadId: string,
  leadsFile?: string,
  reviewQueueFile?: string
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

  const readiness = evaluateLeadReadiness(lead);

  if (!readiness.readyForQuoteReview) {
    return {
      outcome: "not_ready" as const,
      readiness
    };
  }

  const existingReview = reviewQueueFile === undefined
    ? await sqliteReviewRepository.findPendingByLeadId(
        leadId
      )
    : (JSON.parse(
        await readFile(reviewQueueFile, "utf-8")
      ) as ReviewTask[]).find(
        (review) =>
          review.leadId === leadId &&
          review.status === "pending"
      );

  if (existingReview) {
    return {
      outcome: "already_pending" as const,
      review: existingReview,
      readiness
    };
  }

  const requestedChecks: RequestedCheck[] = [
    "inventory",
    "pricing",
    "lead_time"
  ];

  if (lead.requestCoa) {
    requestedChecks.push("coa");
  }

  const now = new Date().toISOString();

  const review: ReviewTask = {
    id: randomUUID(),
    leadId,
    status: "pending",
    requestedChecks,
    inventoryConfirmed: null,
    unitPrice: null,
    currency: null,
    leadTimeDays: null,
    coaStatus: null,
    reviewNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now
  };

  if (reviewQueueFile === undefined) {
    const inserted = await sqliteReviewRepository.insert(
      review
    );

    if (!inserted) {
      const concurrentReview =
        await sqliteReviewRepository.findPendingByLeadId(
          leadId
        );

      if (concurrentReview) {
        return {
          outcome: "already_pending" as const,
          review: concurrentReview,
          readiness
        };
      }

      throw new Error("人工审核任务保存失败");
    }
  } else {
    const reviews: ReviewTask[] = JSON.parse(
      await readFile(reviewQueueFile, "utf-8")
    );

    reviews.push(review);

    await writeFile(
      reviewQueueFile,
      JSON.stringify(reviews, null, 2),
      "utf-8"
    );
  }

  return {
    outcome: "created" as const,
    review,
    readiness
  };
}

export async function listReviewTasks(
  status?: ReviewStatus,
  reviewQueueFile?: string
) {
  if (reviewQueueFile === undefined) {
    return sqliteReviewRepository.list(status);
  }

  const fileText = await readFile(
    reviewQueueFile,
    "utf-8"
  );

  const reviews: ReviewTask[] = JSON.parse(fileText);

  return status === undefined
    ? reviews
    : reviews.filter(
        (review) => review.status === status
      );
}

export async function decideReview(
  reviewId: string,
  input: ReviewDecisionInput,
  reviewQueueFile?: string
) {
  const reviews = reviewQueueFile === undefined
    ? await sqliteReviewRepository.list()
    : JSON.parse(
        await readFile(reviewQueueFile, "utf-8")
      ) as ReviewTask[];

  const review = reviews.find(
    (item) => item.id === reviewId
  );

  if (!review) {
    return {
      outcome: "review_not_found" as const,
      reviewId
    };
  }

  if (review.status !== "pending") {
    return {
      outcome: "already_decided" as const,
      review
    };
  }

  const reviewedBy = normalizeNullableString(
    input.reviewedBy
  );

  if (reviewedBy === null) {
    throw new Error("审核人不能为空");
  }

  const reviewNotes = normalizeNullableString(
    input.reviewNotes
  );

  const expectedUpdatedAt = review.updatedAt;

  if (
    input.decision === "rejected" &&
    reviewNotes === null
  ) {
    throw new Error("拒绝审核时必须填写原因");
  }

  const coaRequested =
    review.requestedChecks.includes("coa");

  let coaStatus: CoaStatus | null = coaRequested
    ? input.coaStatus
    : "not_requested";

  if (
    coaRequested &&
    input.decision === "approved"
  ) {
    if (
      input.coaStatus !== "available" &&
      input.coaStatus !== "unavailable"
    ) {
      throw new Error(
        "客户要求 COA 时必须确认 COA 状态"
      );
    }
  }

  if (input.decision === "approved") {
    if (input.inventoryConfirmed !== true) {
      throw new Error(
        "批准报价前必须确认库存"
      );
    }

    if (
      input.unitPrice === null ||
      input.unitPrice <= 0
    ) {
      throw new Error(
        "批准报价前必须填写有效单价"
      );
    }

    if (normalizeNullableString(input.currency) === null) {
      throw new Error(
        "批准报价前必须填写币种"
      );
    }

    if (
      input.leadTimeDays === null ||
      input.leadTimeDays <= 0
    ) {
      throw new Error(
        "批准报价前必须填写有效交期"
      );
    }
  }

  const now = new Date().toISOString();

  review.status = input.decision;
  review.inventoryConfirmed =
    input.inventoryConfirmed;
  review.unitPrice = input.unitPrice;
  review.currency = normalizeNullableString(
    input.currency
  )?.toUpperCase() ?? null;
  review.leadTimeDays = input.leadTimeDays;
  review.coaStatus = coaStatus;
  review.reviewNotes = reviewNotes;
  review.reviewedBy = reviewedBy;
  review.reviewedAt = now;
  review.updatedAt = now;

  if (reviewQueueFile === undefined) {
    const updated = await sqliteReviewRepository.update(
      review,
      expectedUpdatedAt
    );

    if (!updated) {
      return {
        outcome: "conflict" as const,
        reviewId
      };
    }
  } else {
    await writeFile(
      reviewQueueFile,
      JSON.stringify(reviews, null, 2),
      "utf-8"
    );
  }

  return {
    outcome: "decided" as const,
    review
  };
}

export async function lookupReviewStatus(
  leadId: string,
  reviewQueueFile?: string
): Promise<CustomerReviewStatus> {
  const review = await findLatestReviewByLeadId(
    leadId,
    reviewQueueFile
  );

  if (!review) {
    return {
      status: "not_found",
      leadId
    };
  }

  if (review.status === "pending") {
    return {
      status: "pending",
      leadId
    };
  }

  if (review.status === "rejected") {
    return {
      status: "rejected",
      leadId
    };
  }

  if (
    review.inventoryConfirmed !== true ||
    review.unitPrice === null ||
    review.currency === null ||
    review.leadTimeDays === null ||
    review.coaStatus === null
  ) {
    throw new Error(
      "已批准的审核任务缺少客户可见的确认信息"
    );
  }

  return {
    status: "approved",
    leadId,
    inventoryConfirmed: true,
    unitPrice: review.unitPrice,
    currency: review.currency,
    leadTimeDays: review.leadTimeDays,
    coaStatus: review.coaStatus
  };
}

export async function findLatestReviewByLeadId(
  leadId: string,
  reviewQueueFile?: string
) {
  if (reviewQueueFile === undefined) {
    return sqliteReviewRepository.findLatestByLeadId(
      leadId
    );
  }

  const fileText = await readFile(
    reviewQueueFile,
    "utf-8"
  );

  const reviews: ReviewTask[] = JSON.parse(fileText);

  const review = reviews
    .filter((item) => item.leadId === leadId)
    .sort((first, second) =>
      second.updatedAt.localeCompare(first.updatedAt)
    )[0];

  return review ?? null;
}
