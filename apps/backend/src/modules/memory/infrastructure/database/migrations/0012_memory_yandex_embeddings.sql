DROP INDEX IF EXISTS memory_chunks_embedding_hnsw_idx;

-- Switching embedding spaces requires re-embedding chunks. Existing vectors are
-- cleared instead of lossy-casting old 1024-dimensional values into Yandex v2.
UPDATE memory_chunks
SET embedding = NULL,
    embedding_model = 'yandex:text-embeddings-v2-doc:768'
WHERE embedding IS NOT NULL;

ALTER TABLE memory_chunks
  ALTER COLUMN embedding TYPE vector(768)
  USING NULL::vector(768);
