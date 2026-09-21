import test from "node:test";
import assert from "node:assert/strict";

import {
  findProductByName
} from "../data/products.ts";

test("可以根据名称找到已有产品", () => {
  const product = findProductByName("Product A");

  assert.ok(product);
  assert.equal(product.sku, "PA-99");
  assert.equal(product.name, "Product A");
  assert.equal(product.purity, "99%");
});

test("查询不存在的产品时返回 undefined", () => {
  const product = findProductByName("Product X");

  assert.equal(product, undefined);
});