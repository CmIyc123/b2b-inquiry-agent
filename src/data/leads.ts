import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  sqliteLeadRepository
} from "../repositories/sqlite.ts";

export const LEADS_FILE = join(
  process.cwd(),
  "data",
  "leads.json"
);

export type LeadInput = {
  name: string | null;
  contactEmail: string | null;
  company: string | null;
  country: string | null;
  product: string | null;
  quantity: number | null;
  unit: string | null;
  purity: string | null;
  deliveryAddress: string | null;
  incoterm: string | null;
  requestCoa: boolean;
  requestQuote: boolean;
};

export type Lead = LeadInput & {
  id: string;
  createdAt: string | null;
  updatedAt: string | null;
};

export type LeadUpdate = {
  contactEmail?: string | null;
  deliveryAddress?: string | null;
  incoterm?: string | null;
};

const REQUIRED_QUOTE_FIELDS = [
  "contactEmail",
  "company",
  "product",
  "quantity",
  "unit",
  "purity",
  "deliveryAddress",
  "incoterm"
] as const;

export type RequiredQuoteField =
  typeof REQUIRED_QUOTE_FIELDS[number];

export type LeadReadiness = {
  leadId: string;
  readyForQuoteReview: boolean;
  missingFields: RequiredQuoteField[];
  nextAction:
    | "ask_customer"
    | "human_review"
    | "no_quote_requested";
};

function normalizeNullableString(
  value: string | null | undefined
) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();

  return normalized === ""
    ? null
    : normalized;
}

export async function saveLead(
  input: LeadInput,
  leadsFile?: string
) {
  const now = new Date().toISOString();

  const lead: Lead = {
    ...input,
    contactEmail: normalizeEmail(
      input.contactEmail
    ),
    deliveryAddress: normalizeNullableString(
      input.deliveryAddress
    ),
    incoterm: normalizeNullableString(
      input.incoterm
    ),
    id: randomUUID(),
    createdAt: now,
    updatedAt: now
  };

  if (leadsFile === undefined) {
    await sqliteLeadRepository.insert(lead);
    return lead;
  }

  const fileText = await readFile(
    leadsFile,
    "utf-8"
  );

  const leads: Lead[] = JSON.parse(fileText);

  leads.push(lead);

  await writeFile(
    leadsFile,
    JSON.stringify(leads, null, 2),
    "utf-8"
  );

  return lead;
}

export async function updateLead(
  leadId: string,
  updates: LeadUpdate,
  leadsFile?: string
) {
  if (
    updates.contactEmail === undefined &&
    updates.deliveryAddress === undefined &&
    updates.incoterm === undefined
  ) {
    throw new Error("没有提供需要更新的字段");
  }

  const normalizedUpdates: LeadUpdate = {};

  if (updates.contactEmail !== undefined) {
    normalizedUpdates.contactEmail = normalizeEmail(
      updates.contactEmail
    );
  }

  if (updates.deliveryAddress !== undefined) {
    normalizedUpdates.deliveryAddress =
      normalizeNullableString(
        updates.deliveryAddress
      );
  }

  if (updates.incoterm !== undefined) {
    normalizedUpdates.incoterm =
      normalizeNullableString(
        updates.incoterm
      );
  }

  const updatedAt = new Date().toISOString();

  if (leadsFile === undefined) {
    return sqliteLeadRepository.update(
      leadId,
      normalizedUpdates,
      updatedAt
    );
  }

  const fileText = await readFile(
    leadsFile,
    "utf-8"
  );

  const leads: Lead[] = JSON.parse(fileText);

  const lead = leads.find(
    (item) => item.id === leadId
  );

  if (!lead) {
    return null;
  }

  Object.assign(lead, normalizedUpdates);
  lead.updatedAt = updatedAt;

  await writeFile(
    leadsFile,
    JSON.stringify(leads, null, 2),
    "utf-8"
  );

  return lead;
}

export async function findLeadsByEmail(
  contactEmail: string,
  product: string | null | undefined = null,
  leadsFile?: string
) {
  const normalizedEmail = normalizeEmail(contactEmail);

  if (normalizedEmail === null) {
    return [];
  }

  const normalizedProduct =
    normalizeNullableString(product)?.toLowerCase() ?? null;

  if (leadsFile === undefined) {
    return sqliteLeadRepository.findByEmail(
      normalizedEmail,
      normalizedProduct
    );
  }

  const fileText = await readFile(
    leadsFile,
    "utf-8"
  );

  const leads: Lead[] = JSON.parse(fileText);

  return leads
    .filter((lead) => {
      const emailMatches =
        normalizeEmail(lead.contactEmail) === normalizedEmail;

      const productMatches =
        normalizedProduct === null ||
        normalizeNullableString(lead.product)?.toLowerCase() ===
          normalizedProduct;

      return emailMatches && productMatches;
    })
    .sort((first, second) => {
      const firstTime =
        first.updatedAt ?? first.createdAt ?? "";

      const secondTime =
        second.updatedAt ?? second.createdAt ?? "";

      return secondTime.localeCompare(firstTime);
    })
    .slice(0, 5);
}

export function evaluateLeadReadiness(
  lead: Lead
): LeadReadiness {
  const missingFields = REQUIRED_QUOTE_FIELDS.filter(
    (field) => {
      const value = lead[field];

      if (field === "quantity") {
        return typeof value !== "number" || value <= 0;
      }

      return (
        typeof value !== "string" ||
        value.trim() === ""
      );
    }
  );

  const readyForQuoteReview =
    lead.requestQuote && missingFields.length === 0;

  const nextAction = !lead.requestQuote
    ? "no_quote_requested"
    : readyForQuoteReview
      ? "human_review"
      : "ask_customer";

  return {
    leadId: lead.id,
    readyForQuoteReview,
    missingFields,
    nextAction
  };
}

export async function checkLeadReadiness(
  leadId: string,
  leadsFile?: string
) {
  const lead = await findLeadById(
    leadId,
    leadsFile
  );

  return lead
    ? evaluateLeadReadiness(lead)
    : null;
}

export async function findLeadById(
  leadId: string,
  leadsFile?: string
) {
  if (leadsFile === undefined) {
    return sqliteLeadRepository.findById(leadId);
  }

  const fileText = await readFile(
    leadsFile,
    "utf-8"
  );

  const leads: Lead[] = JSON.parse(fileText);

  const lead = leads.find(
    (item) => item.id === leadId
  );

  return lead ?? null;
}

function normalizeEmail(
  value: string | null | undefined
) {
  const normalized = normalizeNullableString(value);

  return normalized === null
    ? null
    : normalized.toLowerCase();
}
