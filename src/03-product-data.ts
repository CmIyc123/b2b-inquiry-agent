import {
  findProductByName,
  products
} from "./data/products.ts";

console.log("产品数量：", products.length);
console.log("第一个产品：", products[0]);

const foundProduct = findProductByName("product a");
const missingProduct = findProductByName("Product X");

console.log("查询 Product A：", foundProduct);
console.log("查询 Product X：", missingProduct);