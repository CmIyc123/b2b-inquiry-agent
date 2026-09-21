const TARGET_CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 140;

export function normalizeDocumentText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkDocumentText(text: string) {
  const normalized = normalizeDocumentText(text);

  if (!normalized) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(
      normalized.length,
      start + TARGET_CHUNK_SIZE
    );

    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf(
        "\n\n",
        end
      );
      const sentenceBreak = Math.max(
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("。", end),
        normalized.lastIndexOf("! ", end),
        normalized.lastIndexOf("? ", end)
      );
      const preferredBreak = Math.max(
        paragraphBreak,
        sentenceBreak
      );

      if (preferredBreak > start + TARGET_CHUNK_SIZE / 2) {
        end = preferredBreak + (
          preferredBreak === paragraphBreak ? 2 : 1
        );
      }
    }

    const chunk = normalized.slice(start, end).trim();

    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) {
      break;
    }

    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }

  return chunks;
}
