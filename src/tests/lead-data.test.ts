import test from "node:test";
import assert from "node:assert/strict";

import {
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";

import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  checkLeadReadiness,
  findLeadsByEmail,
  saveLead,
  updateLead,
  type Lead,
  type LeadInput
} from "../data/leads.ts";

const testLead: LeadInput = {
  name: "Test Customer",
  contactEmail: "test@example.com",
  company: "Test Company",
  country: "France",
  product: "Product A",
  quantity: 500,
  unit: "g",
  purity: "99%",
  deliveryAddress: null,
  incoterm: null,
  requestCoa: false,
  requestQuote: true
};

async function createTemporaryLeadsFile() {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-")
  );

  const file = join(directory, "leads.json");

  await writeFile(file, "[]", "utf-8");

  return {
    directory,
    file
  };
}

test("saveLead 保存新客户并生成 ID 和时间", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const savedLead = await saveLead(
    testLead,
    temporary.file
  );

  assert.ok(savedLead.id);
  assert.ok(savedLead.createdAt);
  assert.equal(
    savedLead.createdAt,
    savedLead.updatedAt
  );

  const fileText = await readFile(
    temporary.file,
    "utf-8"
  );

  const storedLeads: Lead[] = JSON.parse(fileText);

  assert.equal(storedLeads.length, 1);
  assert.equal(storedLeads[0]?.id, savedLead.id);
  assert.equal(
    storedLeads[0]?.name,
    "Test Customer"
  );
});

test("updateLead 只更新原有客户，不创建重复数据", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const savedLead = await saveLead(
    testLead,
    temporary.file
  );

  const updatedLead = await updateLead(
    savedLead.id,
    {
      deliveryAddress: "Lyon, France",
      incoterm: "DAP"
    },
    temporary.file
  );

  assert.ok(updatedLead);
  assert.equal(updatedLead.id, savedLead.id);
  assert.equal(
    updatedLead.createdAt,
    savedLead.createdAt
  );
  assert.equal(
    updatedLead.deliveryAddress,
    "Lyon, France"
  );
  assert.equal(updatedLead.incoterm, "DAP");

  const fileText = await readFile(
    temporary.file,
    "utf-8"
  );

  const storedLeads: Lead[] = JSON.parse(fileText);

  assert.equal(storedLeads.length, 1);
  assert.equal(
    storedLeads[0]?.id,
    savedLead.id
  );
});

test("saveLead 将空白字段统一保存为 null", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const savedLead = await saveLead(
    {
      ...testLead,
      contactEmail: "   ",
      deliveryAddress: "   ",
      incoterm: ""
    },
    temporary.file
  );

  assert.equal(savedLead.deliveryAddress, null);
  assert.equal(savedLead.incoterm, null);
  assert.equal(savedLead.contactEmail, null);

  const fileText = await readFile(
    temporary.file,
    "utf-8"
  );

  const storedLeads: Lead[] = JSON.parse(fileText);

  assert.equal(
    storedLeads[0]?.deliveryAddress,
    null
  );

  assert.equal(
    storedLeads[0]?.incoterm,
    null
  );

  assert.equal(
    storedLeads[0]?.contactEmail,
    null
  );
});

test("updateLead 只修改传入字段并保留其他数据", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const savedLead = await saveLead(
    {
      ...testLead,
      deliveryAddress: "Paris, France",
      incoterm: "FOB"
    },
    temporary.file
  );

  const updatedLead = await updateLead(
    savedLead.id,
    {
      deliveryAddress: "  Lyon, France  "
    },
    temporary.file
  );

  assert.ok(updatedLead);

  assert.equal(
    updatedLead.deliveryAddress,
    "Lyon, France"
  );

  assert.equal(
    updatedLead.incoterm,
    "FOB"
  );
});

test("updateLead 找不到 ID 时返回 null", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const result = await updateLead(
    "missing-lead-id",
    {
      incoterm: "DAP"
    },
    temporary.file
  );

  assert.equal(result, null);
});

test("updateLead 没有变化字段时拒绝更新", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const savedLead = await saveLead(
    testLead,
    temporary.file
  );

  await assert.rejects(
    () => updateLead(
      savedLead.id,
      {},
      temporary.file
    ),
    /没有提供需要更新的字段/
  );
});

test("findLeadsByEmail 忽略邮箱大小写并可按产品筛选", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const firstLead = await saveLead(
    {
      ...testLead,
      contactEmail: "  CLIENT@Example.COM  ",
      product: "Product A"
    },
    temporary.file
  );

  await saveLead(
    {
      ...testLead,
      contactEmail: "client@example.com",
      product: "Product B"
    },
    temporary.file
  );

  const allMatches = await findLeadsByEmail(
    "CLIENT@example.com",
    null,
    temporary.file
  );

  const productMatches = await findLeadsByEmail(
    "client@example.com",
    "product a",
    temporary.file
  );

  assert.equal(allMatches.length, 2);
  assert.equal(productMatches.length, 1);
  assert.equal(productMatches[0]?.id, firstLead.id);
  assert.equal(
    productMatches[0]?.contactEmail,
    "client@example.com"
  );
});

test("checkLeadReadiness 只返回真正缺失的报价字段", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const savedLead = await saveLead(
    testLead,
    temporary.file
  );

  const readiness = await checkLeadReadiness(
    savedLead.id,
    temporary.file
  );

  assert.ok(readiness);
  assert.equal(
    readiness.readyForQuoteReview,
    false
  );
  assert.deepEqual(
    readiness.missingFields,
    ["deliveryAddress", "incoterm"]
  );
  assert.equal(
    readiness.nextAction,
    "ask_customer"
  );
});

test("checkLeadReadiness 资料完整时进入人工审核", async (t) => {
  const temporary = await createTemporaryLeadsFile();

  t.after(async () => {
    await rm(temporary.directory, {
      recursive: true,
      force: true
    });
  });

  const savedLead = await saveLead(
    {
      ...testLead,
      deliveryAddress: "Lyon, France",
      incoterm: "DAP"
    },
    temporary.file
  );

  const readiness = await checkLeadReadiness(
    savedLead.id,
    temporary.file
  );

  assert.ok(readiness);
  assert.equal(
    readiness.readyForQuoteReview,
    true
  );
  assert.deepEqual(readiness.missingFields, []);
  assert.equal(
    readiness.nextAction,
    "human_review"
  );
});
