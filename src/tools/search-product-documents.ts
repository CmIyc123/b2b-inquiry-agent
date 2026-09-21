import { Type } from "typebox";
import {
  defineTool
} from "@earendil-works/pi-coding-agent";

import {
  searchProductKnowledge
} from "../data/product-knowledge.ts";

export const searchProductDocumentsTool = defineTool({
  name: "search_product_documents",
  label: "检索产品文档",
  description:
    "Search approved product brochures, TDS, SDS, manuals, and other imported documents. Use this for documented specifications, applications, handling, or technical questions. This tool is not a source for live price, inventory, or lead time.",

  parameters: Type.Object({
    query: Type.String({
      description: "A concise search query based on the customer's question."
    }),
    productSku: Type.Optional(Type.String({
      description: "Known product SKU used to limit retrieval to one product."
    }))
  }),

  async execute(_toolCallId, params) {
    const matches = await searchProductKnowledge(
      params.query,
      params.productSku,
      5
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            matches: matches.map((match) => ({
              productSku: match.productSku,
              documentType: match.documentType,
              source: match.originalFilename,
              title: match.title,
              version: match.version,
              chunkIndex: match.chunkIndex,
              content: match.content
            }))
          })
        }
      ],
      details: {}
    };
  }
});
