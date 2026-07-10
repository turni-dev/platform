import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const adrPath = 'docs/adr/0005-embedding-dimensions.md';
const docsWithEmbeddingDecisions = [
  'AGENTS.md',
  'docs/adr/0002-local-compose-stack.md',
  'docs/superpowers/specs/2026-07-02-s1-e1-database-schema-v1-design.md',
  'docs/superpowers/plans/2026-07-02-s1-e1-database-schema-v1.md'
];

describe('embedding dimension decision', () => {
  it('documents that the MVP pgvector schema uses 768-dimensional Yandex embeddings', async () => {
    const adr = await readFile(adrPath, 'utf8');

    assert.match(adr, /PostgreSQL \+ pgvector/);
    assert.match(adr, /vector\(768\)/);
    assert.match(adr, /Yandex Text Embeddings v2/);
    assert.match(adr, /text-embeddings-v2-doc/);
    assert.match(adr, /text-embeddings-v2-query/);
    assert.match(adr, /EmbeddingsGigaR.*2560/s);
    assert.match(adr, /partial.*embedding_model/s);
    assert.match(adr, /hnsw\.iterative_scan/);
  });

  it('does not describe EmbeddingsGigaR as a 1024-dimensional model', async () => {
    const contents = await Promise.all(
      docsWithEmbeddingDecisions.map(async (path) => [
        path,
        await readFile(path, 'utf8')
      ])
    );

    for (const [path, content] of contents) {
      assert.doesNotMatch(
        content,
        /EmbeddingsGigaR.{0,80}1024|1024.{0,80}EmbeddingsGigaR/s,
        `${path} must not pair EmbeddingsGigaR with 1024 dimensions`
      );
    }
  });
});
