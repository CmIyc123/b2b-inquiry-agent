import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import {
  findLeadsByEmail
} from "../data/leads.ts";

const OptionalNullableString = Type.Optional(
  Type.Union([
    Type.String(),
    Type.Null()
  ])
);

export const lookupLeadTool = defineTool({
  name: "lookup_lead",
  label: "查询客户线索",
  description:
    "Find up to five recent sales leads by customer email, optionally filtered by product. Use this before creating a lead when an email is available, and when continuing an inquiry across sessions.",

  parameters: Type.Object({
    contactEmail: Type.String({
      description:
        "Customer email address used to find previous leads."
    }),
    product: OptionalNullableString
  }),

  async execute(_toolCallId, params) {
    const leads = await findLeadsByEmail(
      params.contactEmail,
      params.product
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            found: leads.length > 0,
            leads
          })
        }
      ],
      details: {}
    };
  }
});
