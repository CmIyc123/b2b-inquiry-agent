export const products = [
  {
    sku: "PA-99",
    name: "Product A",
    purity: "99%",
    packagingOptions: ["500 g", "1 kg"],
    catalogStatus: "listed",
    inventoryStatus: "requires_confirmation"
  }
];

export function findProductByName(name: string) {
  return products.find(
    (product) => product.name.toLowerCase() === name.toLowerCase()
  );
}