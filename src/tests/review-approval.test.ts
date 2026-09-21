import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  decideReview,
  type ReviewTask
} from "../data/reviews.ts";

function createPendingReview(
  overrides: Partial<ReviewTask> = {}
): ReviewTask {
  return {
    id: "review-test-001",
    leadId: "lead-test-001",
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

async function createTemporaryReviewQueue(
  review = createPendingReview()
) {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-approval-")
  );

  const reviewQueueFile = join(
    directory,
    "review-queue.json"
  );

  await writeFile(
    reviewQueueFile,
    JSON.stringify([review], null, 2),
    "utf-8"
  );

  return {
    directory,
    reviewQueueFile
  };
}

test("人工可以批准完整审核且不能重复审批", async (t) => {
  const temporary = await createTemporaryReviewQueue();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const decision = {
    decision: "approved" as const,
    inventoryConfirmed: true,
    unitPrice: 120,
    currency: " usd ",
    leadTimeDays: 7,
    coaStatus: "available" as const,
    reviewNotes: "Confirmed by sales team",
    reviewedBy: "sales-admin"
  };

  const firstResult = await decideReview(
    "review-test-001",
    decision,
    temporary.reviewQueueFile
  );

  const secondResult = await decideReview(
    "review-test-001",
    decision,
    temporary.reviewQueueFile
  );

  assert.equal(firstResult.outcome, "decided");
  assert.equal(secondResult.outcome, "already_decided");

  if (firstResult.outcome !== "decided") {
    assert.fail("预期审核成功");
  }

  assert.equal(firstResult.review.status, "approved");
  assert.equal(firstResult.review.currency, "USD");
  assert.equal(firstResult.review.unitPrice, 120);
  assert.ok(firstResult.review.reviewedAt);
});

test("缺少有效报价信息时不能批准", async (t) => {
  const temporary = await createTemporaryReviewQueue();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  await assert.rejects(
    () => decideReview(
      "review-test-001",
      {
        decision: "approved",
        inventoryConfirmed: true,
        unitPrice: 0,
        currency: "USD",
        leadTimeDays: 7,
        coaStatus: "available",
        reviewNotes: null,
        reviewedBy: "sales-admin"
      },
      temporary.reviewQueueFile
    ),
    /有效单价/
  );

  const queueText = await readFile(
    temporary.reviewQueueFile,
    "utf-8"
  );

  const reviews: ReviewTask[] = JSON.parse(queueText);

  assert.equal(reviews[0]?.status, "pending");
});

test("拒绝审核时必须记录原因", async (t) => {
  const temporary = await createTemporaryReviewQueue();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  await assert.rejects(
    () => decideReview(
      "review-test-001",
      {
        decision: "rejected",
        inventoryConfirmed: null,
        unitPrice: null,
        currency: null,
        leadTimeDays: null,
        coaStatus: null,
        reviewNotes: "   ",
        reviewedBy: "sales-admin"
      },
      temporary.reviewQueueFile
    ),
    /必须填写原因/
  );

  const result = await decideReview(
    "review-test-001",
    {
      decision: "rejected",
      inventoryConfirmed: null,
      unitPrice: null,
      currency: null,
      leadTimeDays: null,
      coaStatus: null,
      reviewNotes: "Inventory unavailable",
      reviewedBy: "sales-admin"
    },
    temporary.reviewQueueFile
  );

  assert.equal(result.outcome, "decided");

  if (result.outcome !== "decided") {
    assert.fail("预期拒绝审核成功");
  }

  assert.equal(result.review.status, "rejected");
  assert.equal(
    result.review.reviewNotes,
    "Inventory unavailable"
  );
});
