# ADR 0005: Embedding Dimensions for pgvector Memory

## Status

Accepted

## Context

Turni stores memory chunks in PostgreSQL + pgvector so tenant data, RLS,
transactions, backups, and vector search stay in one operational database for
MVP-1. The current memory schema uses `embedding vector(768)` and an HNSW
cosine index.

Yandex AI Studio covers the MVP model surface in one provider context:
generation, classification, and text embeddings. Its current Text Embeddings v2
models provide document and query variants with selectable dimensions up to 768.
Sber's current public documentation lists `EmbeddingsGigaR` as
2560-dimensional, so it does not fit this schema without a separate migration.

## Decision

Keep PostgreSQL + pgvector for MVP memory retrieval and keep the schema at
`vector(768)`.

Use Yandex Text Embeddings v2 as the primary embedding model family:

- `emb://<folder_id>/text-embeddings-v2-doc/` for memory chunks
- `emb://<folder_id>/text-embeddings-v2-query/` for retrieval queries
- 768 dimensions for both doc and query vectors

Do not configure `EmbeddingsGigaR` behind the current `EmbeddingPort`.

When adding retrieval migrations or changing the current embedding model, keep
the HNSW index model-scoped, for example with a partial predicate on
`embedding_model`, so multiple embedding spaces are never searched through one
index.

Tenant and metadata filters must be treated as approximate-search recall risks.
Retrieval queries should set `hnsw.iterative_scan` and tune `hnsw.ef_search`
inside the transaction when filtering by tenant, agent, file, or active model.

## Consequences

The MVP avoids a separate vector database and keeps RAG data under PostgreSQL
RLS and PITR.

Using `EmbeddingsGigaR`, bge-m3, or another non-768 embedding model later is a
migration project, not a configuration flip. Options include a new model-specific
table or column, pgvector `halfvec` / expression indexing, dimensionality
reduction, or moving vector retrieval behind `Memory.retrieve()` to a dedicated
vector store if scale or recall requires it.
