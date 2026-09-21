export const PRODUCT_DOCUMENT_TYPES = [
  "brochure",
  "tds",
  "sds",
  "coa_template",
  "manual",
  "other"
] as const;

export type ProductDocumentType =
  typeof PRODUCT_DOCUMENT_TYPES[number];

export type ProductDocument = {
  id: string;
  productSku: string;
  documentType: ProductDocumentType;
  title: string;
  originalFilename: string;
  mimeType: string;
  checksumSha256: string;
  version: number;
  status: "active" | "superseded";
  characterCount: number;
  chunkCount: number;
  createdAt: string;
};

export type ProductDocumentChunk = {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  characterCount: number;
};

export type ProductKnowledgeMatch = {
  documentId: string;
  productSku: string;
  documentType: ProductDocumentType;
  title: string;
  originalFilename: string;
  version: number;
  chunkIndex: number;
  content: string;
  score: number;
};

export interface ProductKnowledgeRepository {
  findDocumentByChecksum(
    checksumSha256: string
  ): Promise<ProductDocument | null>;
  importDocument(
    document: Omit<ProductDocument, "version" | "status">,
    chunks: ProductDocumentChunk[]
  ): Promise<ProductDocument>;
  listDocuments(
    productSku?: string | null
  ): Promise<ProductDocument[]>;
  search(
    query: string,
    productSku?: string | null,
    limit?: number
  ): Promise<ProductKnowledgeMatch[]>;
}
