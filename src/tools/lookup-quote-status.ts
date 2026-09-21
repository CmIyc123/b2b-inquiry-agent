import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import {
  lookupQuoteStatus
} from "../data/quotes.ts";

export const lookupQuoteStatusTool = defineTool({
  name: "lookup_quote_status",
  label: "查询报价状态",
  description:
    "Read the customer-safe status and commercial terms of an existing quotation. This tool is read-only.",

  parameters: Type.Object({
    quoteNumber: Type.String({
      description:
        "The exact quotation number previously given to the customer."
    })
  }),

  async execute(_toolCallId, params) {
    const quote = await lookupQuoteStatus(
      params.quoteNumber
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            quote ?? {
              status: "not_found",
              quoteNumber: params.quoteNumber
            }
          )
        }
      ],
      details: {}
    };
  }
});
