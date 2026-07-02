import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const baseUrl = new URL('./migrations/0005_memory.sql', import.meta.url);
const hnswUrl = new URL(
  './migrations/0006_memory_hnsw.concurrent.sql',
  import.meta.url
);

describe('memory migrations', () => {
  it('creates memory tables with exact-revision cascade', async () => {
    const migration = await readFile(baseUrl, 'utf8');

    expect(
      [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
        (match) => match[1]
      )
    ).toEqual(['memory_files', 'memory_revisions', 'memory_chunks']);
    expect(migration).toContain(
      'FOREIGN KEY (file_id, rev) REFERENCES memory_revisions(file_id, rev)'
    );
    expect(migration).toContain('ON DELETE CASCADE');
  });

  it('forces tenant RLS and immutable revisions', async () => {
    const migration = await readFile(baseUrl, 'utf8');

    for (const table of [
      'memory_files',
      'memory_revisions',
      'memory_chunks'
    ]) {
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`
      );
    }
    expect(migration).toContain(
      'CREATE TRIGGER memory_revisions_immutable_update'
    );
  });

  it('creates HNSW concurrently outside the base migration', async () => {
    const base = await readFile(baseUrl, 'utf8');
    const hnsw = await readFile(hnswUrl, 'utf8');

    expect(base).not.toContain('USING hnsw');
    expect(hnsw).toContain('CREATE INDEX CONCURRENTLY');
    expect(hnsw).toContain(
      'USING hnsw (embedding vector_cosine_ops)'
    );
    expect(hnsw).toContain('WITH (m = 16, ef_construction = 64)');
  });
});
