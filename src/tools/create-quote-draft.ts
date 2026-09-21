import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import {
  createQuoteDraft
} from "../data/quotes.ts";

export const createQuoteDraftTool = defineTool({
  name: "create_quote_draft",
  label: "生成报价草稿",
  description:
    "Create and persist a deterministic quote draft from an approved human review. Pass only the exact lead ID. Price, currency, lead time, and COA status are read from the approved review and cannot be supplied by the model.",

  parameters: Type.Object({
    leadId: Type.String({
      description:
        "The exact lead ID returned by lookup_lead or save_lead."
    })
  }),

  async execute(_toolCallId, params) {
    const result = await createQuoteDraft(
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
