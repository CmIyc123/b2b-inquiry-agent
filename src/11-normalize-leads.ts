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

function normalizeNullableString(
  value: string | null
) {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized === ""
    ? null
    : normalized;
}

const originalText = await readFile(
  LEADS_FILE,
  "utf-8"
);

const leads: Lead[] = JSON.parse(originalText);

let changedRecords = 0;
let changedFields = 0;

const normalizedLeads = leads.map((lead) => {
  const deliveryAddress =
    normalizeNullableString(
      lead.deliveryAddress
    );

  const incoterm =
    normalizeNullableString(
      lead.incoterm
    );

  const deliveryAddressChanged =
    deliveryAddress !== lead.deliveryAddress;

  const incotermChanged =
    incoterm !== lead.incoterm;

  if (
    deliveryAddressChanged ||
    incotermChanged
  ) {
    changedRecords += 1;
  }

  if (deliveryAddressChanged) {
    changedFields += 1;
  }

  if (incotermChanged) {
    changedFields += 1;
  }

  return {
    ...lead,
    deliveryAddress,
    incoterm
  };
});

const shouldApply =
  process.argv.includes("--apply");

console.log("Lead 总数：", leads.length);
console.log("需要修改的记录：", changedRecords);
console.log("需要修改的字段：", changedFields);

if (!shouldApply) {
  console.log(
    "当前为预览模式，没有修改任何文件。"
  );

  console.log(
    "确认结果后，使用 --apply 正式执行。"
  );
} else if (changedFields === 0) {
  console.log(
    "没有需要修改的数据，文件保持不变。"
  );
} else {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  const backupFile = join(
    DATA_DIRECTORY,
    `leads-before-normalize-${timestamp}.json`
  );

  await copyFile(
    LEADS_FILE,
    backupFile
  );

  await writeFile(
    LEADS_FILE,
    JSON.stringify(normalizedLeads, null, 2),
    "utf-8"
  );

  console.log("历史数据标准化完成。");
  console.log("备份文件：", backupFile);
}