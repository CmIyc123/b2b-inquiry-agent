import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ProductKnowledgeApplicationService
} from "../application/knowledge-service.ts";
import {
  SqliteProductKnowledgeRepository
} from "../repositories/sqlite-knowledge.ts";

async function createFixture(t: test.TestContext) {
  const directory = await mkdtemp(
    join(tmpdir(), "dateagent-knowledge-")
  );
  const databaseFile = join(directory, "knowledge.db");
  const service = new ProductKnowledgeApplicationService(
    new SqliteProductKnowledgeRepository(databaseFile)
  );

  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  return service;
}

function encoded(text: string) {
  return Buffer.from(text, "utf-8").toString("base64");
}

test("导入文档后可以通过 FTS5 检索并返回来源", async (t) => {
  const service = await createFixture(t);
  const result = await service.importDocument({
    productSku: "PA-99",
    documentType: "tds",
    title: "Product A Technical Data Sheet",
    filename: "product-a-tds.md",
    mimeType: "text/markdown",
    contentBase64: encoded(
      "Product A is intended for catalyst development. " +
      "Store the material in a cool and dry environment."
    )
  });

  assert.equal(result.outcome, "imported");
  assert.equal(result.document.version, 1);
  assert.equal(result.document.chunkCount, 1);

  const matches = await service.search(
    "catalyst development",
    "PA-99"
  );

  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.originalFilename, "product-a-tds.md");
  assert.match(matches[0]?.content ?? "", /catalyst/);
});

test("相同文件不会重复写入 SQLite 和检索索引", async (t) => {
  const service = await createFixture(t);
  const input = {
    productSku: "PA-99",
    documentType: "manual" as const,
    title: "Product A Manual",
    filename: "product-a.txt",
    mimeType: "text/plain",
    contentBase64: encoded(
      "Product A operating manual with sufficient searchable text."
    )
  };

  const first = await service.importDocument(input);
  const second = await service.importDocument(input);
  const documents = await service.listDocuments("PA-99");

  assert.equal(first.outcome, "imported");
  assert.equal(second.outcome, "duplicate");
  assert.equal(documents.length, 1);
  assert.equal(second.document.id, first.document.id);
});

test("相同文件不能被静默归档到另一个产品", async (t) => {
  const service = await createFixture(t);
  const contentBase64 = encoded(
    "Shared-looking document content with sufficient searchable text."
  );

  await service.importDocument({
    productSku: "PA-99",
    documentType: "manual",
    title: "Product A Manual",
    filename: "manual.txt",
    mimeType: "text/plain",
    contentBase64
  });

  await assert.rejects(
    service.importDocument({
      productSku: "PB-98",
      documentType: "manual",
      title: "Product B Manual",
      filename: "manual.txt",
      mimeType: "text/plain",
      contentBase64
    }),
    /已经归档到产品 PA-99/
  );
});

test("同名新内容自动升版，旧版本退出 RAG 检索", async (t) => {
  const service = await createFixture(t);
  const base = {
    productSku: "PA-99",
    documentType: "brochure" as const,
    title: "Product A Brochure",
    filename: "brochure.md",
    mimeType: "text/markdown"
  };

  await service.importDocument({
    ...base,
    contentBase64: encoded(
      "Legacy brochure mentions the discontinued amber process."
    )
  });
  const current = await service.importDocument({
    ...base,
    contentBase64: encoded(
      "Current brochure describes the modern cobalt process."
    )
  });

  const documents = await service.listDocuments("PA-99");
  const legacyMatches = await service.search(
    "amber",
    "PA-99"
  );
  const currentMatches = await service.search(
    "cobalt process",
    "PA-99"
  );

  assert.equal(current.document.version, 2);
  assert.equal(documents.length, 2);
  assert.equal(documents.filter(
    (document) => document.status === "active"
  ).length, 1);
  assert.equal(legacyMatches.length, 0);
  assert.equal(currentMatches[0]?.version, 2);
});
