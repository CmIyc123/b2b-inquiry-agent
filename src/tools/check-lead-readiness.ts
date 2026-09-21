import { Type } from "typebox";
import { defineTool } from "@earendil-works/pi-coding-agent";

import {
  checkLeadReadiness
} from "../data/leads.ts";

export const checkLeadReadinessTool = defineTool({
  name: "check_lead_readiness",
  label: "检查线索完整度",
  description:
    "Check which customer-provided fields are still missing before a quotation can move to human review. Use the exact lead ID returned by save_lead, lookup_lead, or update_lead.",

  parameters: Type.Object({
    leadId: Type.String({
      description:
        "The exact lead ID to evaluate."
    })
  }),

  async execute(_toolCallId, params) {
    const readiness = await checkLeadReadiness(
      params.leadId
    );

    if (!readiness) {
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
          text: JSON.stringify(readiness)
        }
      ],
      details: {}
    };
  }
});
