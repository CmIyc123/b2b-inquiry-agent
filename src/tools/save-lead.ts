import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { saveLead } from "../data/leads.ts";

const NullableString = Type.Union([
  Type.String(),
  Type.Null()
]);

export const saveLeadTool = defineTool({
  name: "save_lead",
  label: "保存客户线索",
  description:
    "Save structured customer inquiry information as a sales lead.",

  parameters: Type.Object({
    name: NullableString,
    contactEmail: NullableString,
    company: NullableString,
    country: NullableString,
    product: NullableString,

    quantity: Type.Union([
      Type.Number(),
      Type.Null()
    ]),

    unit: NullableString,
   purity: NullableString,
   deliveryAddress: NullableString,
   incoterm: NullableString,
   requestCoa: Type.Boolean(),
   requestQuote: Type.Boolean()
  }),

  async execute(_toolCallId, params) {
    const savedLead = await saveLead(params);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(savedLead)
        }
      ],
      details: {}
    };
  }
});
