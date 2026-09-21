import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const LEADS_FILE = join(
  process.cwd(),
  "data",
  "leads.json"
);

const fileText = await readFile(LEADS_FILE, "utf-8");
const leads = JSON.parse(fileText);

if (!Array.isArray(leads)) {
  throw new Error("leads.json 的最外层应该是数组");
}

for (const lead of leads) {
  if (lead.deliveryAddress === undefined) {
    lead.deliveryAddress = null;
  }

  if (lead.incoterm === undefined) {
    lead.incoterm = null;
  }

  if (lead.id === undefined) {
    lead.id = randomUUID();
  }

  if (lead.createdAt === undefined) {
    lead.createdAt = null;
  }

  if (lead.updatedAt === undefined) {
    lead.updatedAt = null;
  }
}

await writeFile(
  LEADS_FILE,
  JSON.stringify(leads, null, 2),
  "utf-8"
);

console.log(`迁移完成：${leads.length} 条 Lead`);