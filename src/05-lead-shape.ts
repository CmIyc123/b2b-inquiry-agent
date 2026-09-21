import type { LeadInput } from "./data/leads.ts";

const johnLead: LeadInput = {
  name: "John",
  contactEmail: "john@example.com",
  company: "ABC GmbH",
  country: "Germany",
  product: "Product A",
  quantity: 500,
  unit: "g",
  purity: "99%",
  deliveryAddress: null,
  incoterm: null,
  requestCoa: true,
  requestQuote: true
};

console.log(JSON.stringify(johnLead, null, 2));
