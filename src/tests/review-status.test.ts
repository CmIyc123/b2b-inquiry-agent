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
  lookupReviewStatus,
  type ReviewTask
} from "../data/reviews.ts";

function createReview(
  overrides: Partial<ReviewTask> = {}
): ReviewTask {
  return {
    id: "review-status-001",
    leadId: "lead-status-001",
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

async function createTemporaryQueue(
  reviews: ReviewTask[]
) {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-status-")
  );

  const reviewQueueFile = join(
    directory,
    "review-queue.json"
  );

  await writeFile(
    reviewQueueFile,
    JSON.stringify(reviews, null, 2),
    "utf-8"
  );

  return {
    directory,
    reviewQueueFile
  };
}

test("没有审核任务时返回 not_found", async (t) => {
  const temporary = await createTemporaryQueue([]);

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await lookupReviewStatus(
    "missing-lead",
    temporary.reviewQueueFile
  );

  assert.deepEqual(result, {
    status: "not_found",
    leadId: "missing-lead"
  });
});

test("待审核任务只返回 pending 状态", async (t) => {
  const temporary = await createTemporaryQueue([
    createReview()
  ]);

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await lookupReviewStatus(
    "lead-status-001",
    temporary.reviewQueueFile
  );

  assert.deepEqual(result, {
    status: "pending",
    leadId: "lead-status-001"
  });
});

test("已批准任务只返回客户可见的确认信息", async (t) => {
  const temporary = await createTemporaryQueue([
    createReview({
      status: "approved",
      inventoryConfirmed: true,
      unitPrice: 120,
      currency: "USD",
      leadTimeDays: 7,
      coaStatus: "available",
      reviewNotes: "Internal margin note",
      reviewedBy: "private-admin-name",
      reviewedAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    })
  ]);

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await lookupReviewStatus(
    "lead-status-001",
    temporary.reviewQueueFile
  );

  assert.deepEqual(result, {
    status: "approved",
    leadId: "lead-status-001",
    inventoryConfirmed: true,
    unitPrice: 120,
    currency: "USD",
    leadTimeDays: 7,
    coaStatus: "available"
  });

  assert.equal(
    Object.hasOwn(result, "reviewNotes"),
    false
  );

  assert.equal(
    Object.hasOwn(result, "reviewedBy"),
    false
  );
});

test("已拒绝任务不返回内部拒绝原因", async (t) => {
  const temporary = await createTemporaryQueue([
    createReview({
      status: "rejected",
      reviewNotes: "Internal rejection reason",
      reviewedBy: "private-admin-name",
      reviewedAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    })
  ]);

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await lookupReviewStatus(
    "lead-status-001",
    temporary.reviewQueueFile
  );

  assert.deepEqual(result, {
    status: "rejected",
    leadId: "lead-status-001"
  });
});
