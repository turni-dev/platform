CREATE INDEX CONCURRENTLY memory_chunks_embedding_hnsw_idx
  ON memory_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
