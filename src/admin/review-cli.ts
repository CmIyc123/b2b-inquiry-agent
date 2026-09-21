import { createInterface } from "node:readline/promises";

import {
  decideReview,
  listReviewTasks,
  type CoaStatus,
  type ReviewDecisionInput
} from "../data/reviews.ts";

const terminal = createInterface({
  input: process.stdin,
  output: process.stdout
});

try {
  const pendingReviews = await listReviewTasks(
    "pending"
  );

  if (pendingReviews.length === 0) {
    console.log("当前没有待审核任务。");
  } else {
    console.log("待审核任务：");

    for (const review of pendingReviews) {
      console.log({
        reviewId: review.id,
        leadId: review.leadId,
        requestedChecks: review.requestedChecks,
        createdAt: review.createdAt
      });
    }

    const reviewId = (
      await terminal.question("\n请输入审核任务 ID：")
    ).trim();

    const selectedReview = pendingReviews.find(
      (review) => review.id === reviewId
    );

    if (!selectedReview) {
      throw new Error("没有找到该待审核任务");
    }

    const decisionText = (
      await terminal.question(
        "请输入审核结果（approved/rejected）："
      )
    ).trim().toLowerCase();

    if (
      decisionText !== "approved" &&
      decisionText !== "rejected"
    ) {
      throw new Error("审核结果只能是 approved 或 rejected");
    }

    const reviewedBy = await terminal.question(
      "请输入审核人："
    );

    let decisionInput: ReviewDecisionInput;

    if (decisionText === "approved") {
      const inventoryText = (
        await terminal.question(
          "库存是否已确认（yes/no）："
        )
      ).trim().toLowerCase();

      const unitPrice = Number(
        await terminal.question("请输入单价：")
      );

      const currency = await terminal.question(
        "请输入币种（例如 USD）："
      );

      const leadTimeDays = Number(
        await terminal.question("请输入交期天数：")
      );

      let coaStatus: CoaStatus | null = null;

      if (
        selectedReview.requestedChecks.includes("coa")
      ) {
        const coaText = (
          await terminal.question(
            "COA 状态（available/unavailable）："
          )
        ).trim().toLowerCase();

        if (
          coaText !== "available" &&
          coaText !== "unavailable"
        ) {
          throw new Error(
            "COA 状态只能是 available 或 unavailable"
          );
        }

        coaStatus = coaText;
      }

      const reviewNotes = await terminal.question(
        "审核备注（可留空）："
      );

      decisionInput = {
        decision: "approved",
        inventoryConfirmed:
          inventoryText === "yes" ||
          inventoryText === "y",
        unitPrice,
        currency,
        leadTimeDays,
        coaStatus,
        reviewNotes,
        reviewedBy
      };
    } else {
      const reviewNotes = await terminal.question(
        "请输入拒绝原因："
      );

      decisionInput = {
        decision: "rejected",
        inventoryConfirmed: null,
        unitPrice: null,
        currency: null,
        leadTimeDays: null,
        coaStatus: null,
        reviewNotes,
        reviewedBy
      };
    }

    const result = await decideReview(
      reviewId,
      decisionInput
    );

    console.log(
      "\n审核结果：",
      JSON.stringify(result, null, 2)
    );
  }
} catch (error) {
  process.exitCode = 1;

  console.error(
    "审核失败：",
    error instanceof Error
      ? error.message
      : error
  );
} finally {
  terminal.close();
}
