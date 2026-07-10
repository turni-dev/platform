CREATE INDEX CONCURRENTLY IF NOT EXISTS memory_chunks_embedding_hnsw_idx
  ON memory_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding_model = 'yandex:text-embeddings-v2-doc:768';
