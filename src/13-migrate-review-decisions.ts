import {
  copyFile,
  readFile,
  writeFile
} from "node:fs/promises";

import { join } from "node:path";

import type {
  ReviewTask
} from "./data/reviews.ts";

const DATA_DIRECTORY = join(
  process.cwd(),
  "data"
);

const REVIEW_QUEUE_FILE = join(
  DATA_DIRECTORY,
  "review-queue.json"
);

type DecisionFields = Pick<
  ReviewTask,
  | "inventoryConfirmed"
  | "unitPrice"
  | "currency"
  | "leadTimeDays"
  | "coaStatus"
  | "reviewNotes"
  | "reviewedBy"
  | "reviewedAt"
>;

type HistoricalReview =
  Omit<ReviewTask, keyof DecisionFields> &
  Partial<DecisionFields>;

const decisionFieldNames: Array<keyof DecisionFields> = [
  "inventoryConfirmed",
  "unitPrice",
  "currency",
  "leadTimeDays",
  "coaStatus",
  "reviewNotes",
  "reviewedBy",
  "reviewedAt"
];

const originalText = await readFile(
  REVIEW_QUEUE_FILE,
  "utf-8"
);

const historicalReviews: HistoricalReview[] =
  JSON.parse(originalText);

let changedRecords = 0;

const migratedReviews: ReviewTask[] =
  historicalReviews.map((review) => {
    const needsMigration = decisionFieldNames.some(
      (field) => !(field in review)
    );

    if (needsMigration) {
      changedRecords += 1;
    }

    return {
      ...review,
      inventoryConfirmed:
        review.inventoryConfirmed ?? null,
      unitPrice: review.unitPrice ?? null,
      currency: review.currency ?? null,
      leadTimeDays: review.leadTimeDays ?? null,
      coaStatus: review.coaStatus ?? null,
      reviewNotes: review.reviewNotes ?? null,
      reviewedBy: review.reviewedBy ?? null,
      reviewedAt: review.reviewedAt ?? null
    };
  });

const shouldApply =
  process.argv.includes("--apply");

console.log("审核任务总数：", historicalReviews.length);
console.log("需要迁移的记录：", changedRecords);

if (!shouldApply) {
  console.log(
    "当前为预览模式，没有修改任何文件。"
  );
} else if (changedRecords === 0) {
  console.log(
    "没有需要迁移的数据，文件保持不变。"
  );
} else {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupFile = join(
    DATA_DIRECTORY,
    `review-queue-before-decision-migration-${timestamp}.json`
  );

  await copyFile(
    REVIEW_QUEUE_FILE,
    backupFile
  );

  await writeFile(
    REVIEW_QUEUE_FILE,
    JSON.stringify(migratedReviews, null, 2),
    "utf-8"
  );

  console.log("审核字段迁移完成。");
  console.log("备份文件：", backupFile);
}
