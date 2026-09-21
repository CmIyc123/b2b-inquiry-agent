import { createInterface } from "node:readline/promises";

import {
  listQuotes,
  markQuoteSent
} from "../data/quotes.ts";

const terminal = createInterface({
  input: process.stdin,
  output: process.stdout
});

try {
  const draftQuotes = await listQuotes("draft");

  if (draftQuotes.length === 0) {
    console.log("当前没有待发送的报价草稿。");
  } else {
    console.log("待发送的报价草稿：");

    for (const quote of draftQuotes) {
      console.log({
        quoteNumber: quote.quoteNumber,
        product: quote.product,
        quantity: `${quote.quantity} ${quote.unit}`,
        unitPrice:
          `${quote.unitPrice} ${quote.currency}/${quote.unitPriceBasis}`,
        totalPrice:
          `${quote.totalPrice} ${quote.currency}`,
        incoterm: quote.incoterm,
        deliveryAddress: quote.deliveryAddress
      });
    }

    const quoteNumber = (
      await terminal.question("\n请输入确认已发送的报价编号：")
    ).trim();

    const validDays = Number(
      await terminal.question("请输入报价有效天数：")
    );

    const result = await markQuoteSent(
      quoteNumber,
      validDays
    );

    console.log(
      "\n报价发送状态：",
      JSON.stringify(result, null, 2)
    );
  }
} catch (error) {
  process.exitCode = 1;

  console.error(
    "更新报价状态失败：",
    error instanceof Error
      ? error.message
      : error
  );
} finally {
  terminal.close();
}
