import { Type } from "typebox";
import {
  defineTool
} from "@earendil-works/pi-coding-agent";

import {
  findProductByName
} from "../data/products.ts";

export const lookupProductTool = defineTool({
  name: "lookup_product",
  label: "查询产品",
  description:
    "Look up a product by its name. Use this tool before claiming that a product, purity, or packaging option is available.",

  parameters: Type.Object({
    productName: Type.String({
      description: "The product name provided by the customer."
    })
  }),

  async execute(_toolCallId, params) {
    const product = findProductByName(params.productName);

    if (!product) {
      return {
        content: [
          {
            type: "text",
            text: `No product was found with the name: ${params.productName}`
          }
        ],
        details: {}
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(product)
        }
      ],
      details: {}
    };
  }
});