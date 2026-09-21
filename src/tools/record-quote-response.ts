import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import {
  recordQuoteResponse
} from "../data/quotes.ts";

const OptionalNullableNumber = Type.Optional(
  Type.Union([
    Type.Number(),
    Type.Null()
  ])
);

const OptionalNullableString = Type.Optional(
  Type.Union([
    Type.String(),
    Type.Null()
  ])
);

const OptionalResponseReason = Type.Optional(
  Type.Union([
    Type.Literal("price_too_high"),
    Type.Literal("lead_time_too_long"),
    Type.Literal("terms_unacceptable"),
    Type.Literal("no_longer_needed"),
    Type.Literal("competitor_selected"),
    Type.Literal("other"),
    Type.Null()
  ])
);

export const recordQuoteResponseTool = defineTool({
  name: "record_quote_response",
  label: "记录客户报价反馈",
  description:
    "Record an explicit customer response to a sent quotation: negotiating, accepted, or rejected. Never infer acceptance or rejection from silence, thanks, or an unrelated question.",

  parameters: Type.Object({
    quoteNumber: Type.String({
      description:
        "The exact quotation number previously given to the customer."
    }),
    response: Type.Union([
      Type.Literal("negotiating"),
      Type.Literal("accepted"),
      Type.Literal("rejected")
    ]),
    responseReason: OptionalResponseReason,
    customerTargetPrice: OptionalNullableNumber,
    customerFeedback: OptionalNullableString
  }),

  async execute(_toolCallId, params) {
    const result = await recordQuoteResponse(
      params.quoteNumber,
      {
        response: params.response,
        responseReason: params.responseReason,
        customerTargetPrice: params.customerTargetPrice,
        customerFeedback: params.customerFeedback
      }
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
