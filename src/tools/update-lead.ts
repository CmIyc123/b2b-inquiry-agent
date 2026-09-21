import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import { updateLead } from "../data/leads.ts";

const OptionalNullableString = Type.Optional(
  Type.Union([
    Type.String(),
    Type.Null()
  ])
);

export const updateLeadTool = defineTool({
  name: "update_lead",
  label: "更新客户线索",
  description:
    "Update an existing sales lead by its lead ID when the customer provides follow-up information. Only include fields that changed.",

  parameters: Type.Object({
    leadId: Type.String({
      description:
        "The exact lead ID returned by save_lead."
    }),

    contactEmail: OptionalNullableString,
    deliveryAddress: OptionalNullableString,
    incoterm: OptionalNullableString
  }),

  async execute(_toolCallId, params) {
    const updatedLead = await updateLead(
      params.leadId,
      {
        contactEmail: params.contactEmail,
        deliveryAddress: params.deliveryAddress,
        incoterm: params.incoterm
      }
    );

    if (!updatedLead) {
      return {
        content: [
          {
            type: "text",
            text: `No lead was found with ID: ${params.leadId}`
          }
        ],
        details: {}
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(updatedLead)
        }
      ],
      details: {}
    };
  }
});
