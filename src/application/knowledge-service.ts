import { createHash, randomUUID } from "node:crypto";
import { basename, extname } from "node:path";

import {
  chunkDocumentText
} from "../knowledge/chunk-text.ts";
import {
  DocumentParseError,
  extractDocumentText
} from "../knowledge/document-parser.ts";
import {
  PRODUCT_DOCUMENT_TYPES,
  type ProductDocumentType,
  type ProductKnowledgeRepository
} from "../knowledge/types.ts";

export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export type ImportProductDocumentInput = {
  productSku: string;
  documentType: ProductDocumentType;
  title: string;
  filename: string;
  mimeType: string;
  contentBase64: string;
};

export class KnowledgeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgeValidationError";
  }
}

function decodeBase64(value: string) {
  const compact = value.replace(/\s/g, "");

  if (
    compact === "" ||
    compact.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)
  ) {
    throw new KnowledgeValidationError(
      "文件内容不是有效的 Base64"
    );
  }

  const buffer = Buffer.from(compact, "base64");

  if (buffer.length === 0) {
    throw new KnowledgeValidationError("文件不能为空");
  }

  if (buffer.length > MAX_DOCUMENT_BYTES) {
    throw new KnowledgeValidationError(
      "文件不能超过 8 MB"
    );
  }

  return buffer;
}

function validateInput(input: ImportProductDocumentInput) {
  const productSku = input.productSku.trim();
  const title = input.title.trim();
  const filename = basename(input.filename.trim());
  const mimeType = input.mimeType.trim() ||
    "application/octet-stream";

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(productSku)) {
    throw new KnowledgeValidationError(
      "产品 SKU 只能包含字母、数字、点、下划线和连字符"
    );
  }

  if (title.length < 2 || title.length > 160) {
    throw new KnowledgeValidationError(
      "文档标题长度必须为 2 到 160 个字符"
    );
  }

  if (
    filename.length < 3 ||
    filename.length > 180 ||
    /[\u0000-\u001f]/.test(filename)
  ) {
    throw new KnowledgeValidationError("文件名无效");
  }

  if (!extname(filename)) {
    throw new KnowledgeValidationError("文件名必须包含扩展名");
  }

  if (!PRODUCT_DOCUMENT_TYPES.includes(input.documentType)) {
    throw new KnowledgeValidationError("文档类型无效");
  }

  return {
    productSku,
    title,
    filename,
    mimeType
  };
}

export class ProductKnowledgeApplicationService {
  constructor(
    private readonly repository: ProductKnowledgeRepository
  ) {}

  async importDocument(input: ImportProductDocumentInput) {
    const validated = validateInput(input);
    const buffer = decodeBase64(input.contentBase64);
    const checksumSha256 = createHash("sha256")
      .update(buffer)
      .digest("hex");
    const duplicate = await this.repository
      .findDocumentByChecksum(checksumSha256);

    if (duplicate) {
      if (
        duplicate.productSku.toLowerCase() !==
        validated.productSku.toLowerCase()
      ) {
        throw new KnowledgeValidationError(
          `相同文件已经归档到产品 ${duplicate.productSku}，请确认产品归属`
        );
      }

      return {
        outcome: "duplicate" as const,
        document: duplicate
      };
    }

    let text: string;

    try {
      text = await extractDocumentText(
        validated.filename,
        buffer
      );
    } catch (error) {
      if (error instanceof DocumentParseError) {
        throw new KnowledgeValidationError(error.message);
      }
      throw error;
    }

    const textChunks = chunkDocumentText(text);
    const documentId = randomUUID();
    const chunks = textChunks.map((content, chunkIndex) => ({
      id: randomUUID(),
      documentId,
      chunkIndex,
      content,
      characterCount: content.length
    }));
    const createdAt = new Date().toISOString();
    const document = await this.repository.importDocument(
      {
        id: documentId,
        productSku: validated.productSku,
        documentType: input.documentType,
        title: validated.title,
        originalFilename: validated.filename,
        mimeType: validated.mimeType,
        checksumSha256,
        characterCount: text.length,
        chunkCount: chunks.length,
        createdAt
      },
      chunks
    );

    return {
      outcome: "imported" as const,
      document
    };
  }

  listDocuments(productSku?: string | null) {
    return this.repository.listDocuments(
      productSku?.trim() || null
    );
  }

  search(
    query: string,
    productSku?: string | null,
    limit = 5
  ) {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      throw new KnowledgeValidationError(
        "检索内容至少需要 2 个字符"
      );
    }

    return this.repository.search(
      normalizedQuery,
      productSku?.trim() || null,
      limit
    );
  }
}
