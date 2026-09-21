import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import {
  lookupReviewStatus
} from "../data/reviews.ts";

export const lookupReviewStatusTool = defineTool({
  name: "lookup_review_status",
  label: "查询审核状态",
  description:
    "Read the latest customer-safe review status for a lead. This tool is read-only and never returns internal reviewer identity or internal review notes.",

  parameters: Type.Object({
    leadId: Type.String({
      description:
        "The exact lead ID returned by lookup_lead or save_lead."
    })
  }),

  async execute(_toolCallId, params) {
    const status = await lookupReviewStatus(
      params.leadId
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(status)
        }
      ],
      details: {}
    };
  }
});
