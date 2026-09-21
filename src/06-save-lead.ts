import {
  saveLead,
  type LeadInput
} from "./data/leads.ts";

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

const savedLead = await saveLead(johnLead);

console.log("保存成功：", savedLead);
