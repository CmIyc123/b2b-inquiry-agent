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
  saveLead,
  type LeadInput
} from "../data/leads.ts";

import {
  requestHumanReview,
  type ReviewTask
} from "../data/reviews.ts";

const completeLeadInput: LeadInput = {
  name: "Review Customer",
  contactEmail: "review@example.com",
  company: "Review Company",
  country: "France",
  product: "Product A",
  quantity: 500,
  unit: "g",
  purity: "99%",
  deliveryAddress: "Lyon, France",
  incoterm: "DAP",
  requestCoa: true,
  requestQuote: true
};

async function createTemporaryReviewFiles() {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-review-")
  );

  const leadsFile = join(
    directory,
    "leads.json"
  );

  const reviewQueueFile = join(
    directory,
    "review-queue.json"
  );

  await writeFile(leadsFile, "[]", "utf-8");
  await writeFile(reviewQueueFile, "[]", "utf-8");

  return {
    directory,
    leadsFile,
    reviewQueueFile
  };
}

test("资料不完整时拒绝创建人工审核任务", async (t) => {
  const temporary = await createTemporaryReviewFiles();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const lead = await saveLead(
    {
      ...completeLeadInput,
      deliveryAddress: null,
      incoterm: null
    },
    temporary.leadsFile
  );

  const result = await requestHumanReview(
    lead.id,
    temporary.leadsFile,
    temporary.reviewQueueFile
  );

  assert.equal(result.outcome, "not_ready");

  if (result.outcome !== "not_ready") {
    assert.fail("预期 Lead 资料不完整");
  }

  assert.deepEqual(
    result.readiness.missingFields,
    ["deliveryAddress", "incoterm"]
  );

  const queueText = await readFile(
    temporary.reviewQueueFile,
    "utf-8"
  );

  const reviews: ReviewTask[] = JSON.parse(queueText);

  assert.equal(reviews.length, 0);
});

test("资料完整时创建审核任务并阻止重复提交", async (t) => {
  const temporary = await createTemporaryReviewFiles();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const lead = await saveLead(
    completeLeadInput,
    temporary.leadsFile
  );

  const firstResult = await requestHumanReview(
    lead.id,
    temporary.leadsFile,
    temporary.reviewQueueFile
  );

  const secondResult = await requestHumanReview(
    lead.id,
    temporary.leadsFile,
    temporary.reviewQueueFile
  );

  assert.equal(firstResult.outcome, "created");
  assert.equal(secondResult.outcome, "already_pending");

  if (firstResult.outcome !== "created") {
    assert.fail("预期创建新的审核任务");
  }

  assert.equal(firstResult.review.status, "pending");
  assert.deepEqual(
    firstResult.review.requestedChecks,
    ["inventory", "pricing", "lead_time", "coa"]
  );

  const queueText = await readFile(
    temporary.reviewQueueFile,
    "utf-8"
  );

  const reviews: ReviewTask[] = JSON.parse(queueText);

  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.leadId, lead.id);
});
