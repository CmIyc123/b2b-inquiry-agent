import {
  ProductKnowledgeApplicationService
} from "../application/knowledge-service.ts";
import {
  SqliteProductKnowledgeRepository
} from "../repositories/sqlite-knowledge.ts";

const service = new ProductKnowledgeApplicationService(
  new SqliteProductKnowledgeRepository()
);

export function searchProductKnowledge(
  query: string,
  productSku?: string | null,
  limit = 5
) {
  return service.search(query, productSku, limit);
}
