import { extname } from "node:path";

import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

import {
  normalizeDocumentText
} from "./chunk-text.ts";

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json"
]);

const HTML_EXTENSIONS = new Set([".html", ".htm"]);

export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentParseError";
  }
}

function decodeUtf8(buffer: Buffer) {
  try {
    return new TextDecoder("utf-8", {
      fatal: true
    }).decode(buffer);
  } catch {
    throw new DocumentParseError(
      "文本文件必须使用 UTF-8 编码"
    );
  }
}

function decodeHtmlEntities(value: string) {
  const entities: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return value.replace(
    /&(#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp);/gi,
    (match, entity: string) => {
      if (entity.startsWith("#x")) {
        return String.fromCodePoint(
          Number.parseInt(entity.slice(2), 16)
        );
      }

      if (entity.startsWith("#")) {
        return String.fromCodePoint(
          Number.parseInt(entity.slice(1), 10)
        );
      }

      return entities[entity.toLowerCase()] ?? match;
    }
  );
}

function extractHtmlText(buffer: Buffer) {
  return decodeHtmlEntities(
    decodeUtf8(buffer)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|tr|section)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

export async function extractDocumentText(
  filename: string,
  buffer: Buffer
) {
  const extension = extname(filename).toLowerCase();
  let text: string;

  if (TEXT_EXTENSIONS.has(extension)) {
    text = decodeUtf8(buffer);
  } else if (HTML_EXTENSIONS.has(extension)) {
    text = extractHtmlText(buffer);
  } else if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else {
    throw new DocumentParseError(
      "仅支持 PDF、DOCX、TXT、Markdown、HTML、CSV 和 JSON 文件"
    );
  }

  const normalized = normalizeDocumentText(text);

  if (normalized.length < 20) {
    throw new DocumentParseError(
      "文档中没有足够的可检索文本；扫描版 PDF 需要先进行 OCR"
    );
  }

  return normalized;
}
