import {
  copyFile,
  readFile,
  writeFile
} from "node:fs/promises";

import { join } from "node:path";

import type {
  Lead
} from "./data/leads.ts";

const DATA_DIRECTORY = join(
  process.cwd(),
  "data"
);

const LEADS_FILE = join(
  DATA_DIRECTORY,
  "leads.json"
);

type HistoricalLead = Omit<Lead, "contactEmail"> & {
  contactEmail?: string | null;
};

function normalizeEmail(
  value: string | null | undefined
) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  return normalized === ""
    ? null
    : normalized;
}

const originalText = await readFile(
  LEADS_FILE,
  "utf-8"
);

const historicalLeads: HistoricalLead[] =
  JSON.parse(originalText);

let changedRecords = 0;

const migratedLeads: Lead[] = historicalLeads.map(
  (lead) => {
    const contactEmail = normalizeEmail(
      lead.contactEmail
    );

    if (contactEmail !== lead.contactEmail) {
      changedRecords += 1;
    }

    return {
      ...lead,
      contactEmail
    };
  }
);

const shouldApply =
  process.argv.includes("--apply");

console.log("Lead 总数：", historicalLeads.length);
console.log("需要迁移的记录：", changedRecords);

if (!shouldApply) {
  console.log(
    "当前为预览模式，没有修改任何文件。"
  );
} else if (changedRecords === 0) {
  console.log(
    "没有需要迁移的数据，文件保持不变。"
  );
} else {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupFile = join(
    DATA_DIRECTORY,
    `leads-before-email-migration-${timestamp}.json`
  );

  await copyFile(
    LEADS_FILE,
    backupFile
  );

  await writeFile(
    LEADS_FILE,
    JSON.stringify(migratedLeads, null, 2),
    "utf-8"
  );

  console.log("邮箱字段迁移完成。");
  console.log("备份文件：", backupFile);
}
