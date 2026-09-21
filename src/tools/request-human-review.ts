import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import {
  requestHumanReview
} from "../data/reviews.ts";

export const requestHumanReviewTool = defineTool({
  name: "request_human_review",
  label: "提交人工审核",
  description:
    "Create a pending internal review task for a quote-ready lead. This tool cannot approve or reject a review and prevents duplicate pending tasks.",

  parameters: Type.Object({
    leadId: Type.String({
      description:
        "The exact quote-ready lead ID."
    })
  }),

  async execute(_toolCallId, params) {
    const result = await requestHumanReview(
      params.leadId
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result)
        }
      ],
      details: {}
    };
  }
});
