import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  memoryChunks,
  memoryFiles,
  memoryRevisions,
  memoryTables
} from './schema.js';

describe('memory database schema', () => {
  it('owns files, immutable revisions, and chunks', () => {
    expect(memoryTables.map((table) => getTableConfig(table).name)).toEqual([
      'memory_files',
      'memory_revisions',
      'memory_chunks'
    ]);
  });

  it('enables tenant RLS for every memory table', () => {
    for (const table of memoryTables) {
      const config = getTableConfig(table);

      expect(config.enableRLS).toBe(true);
      expect(config.policies[0]?.name).toBe(
        `${config.name}_tenant_isolation`
      );
    }
  });

  it('stores 1024-dimensional embeddings with cosine HNSW', () => {
    const config = getTableConfig(memoryChunks);
    const embedding = config.columns.find(
      (column) => column.name === 'embedding'
    );
    const hnsw = config.indexes.find(
      (index) => index.config.name === 'memory_chunks_embedding_hnsw_idx'
    );

    expect(embedding?.getSQLType()).toBe('vector(1024)');
    expect(hnsw?.config.method).toBe('hnsw');
    const indexedEmbedding = hnsw?.config.columns[0];
    expect(
      indexedEmbedding && 'indexConfig' in indexedEmbedding
        ? indexedEmbedding.indexConfig?.opClass
        : undefined
    ).toBe('vector_cosine_ops');
  });

  it('cascades chunks from their exact file revision', () => {
    const revisionForeignKey = getTableConfig(memoryChunks).foreignKeys.find(
      (foreignKey) =>
        getTableConfig(foreignKey.reference().foreignTable).name ===
        'memory_revisions'
    );

    expect(revisionForeignKey?.reference().columns.map((column) => column.name))
      .toEqual(['file_id', 'rev']);
    expect(revisionForeignKey?.onDelete).toBe('cascade');
  });

  it('uses active-path and revision uniqueness', () => {
    const fileIndex = getTableConfig(memoryFiles).indexes.find(
      (index) => index.config.name === 'memory_files_agent_path_active_uidx'
    );
    const revisionIndex = getTableConfig(memoryRevisions).indexes.find(
      (index) => index.config.name === 'memory_revisions_file_rev_uidx'
    );

    expect(fileIndex?.config.unique).toBe(true);
    expect(fileIndex?.config.where).toBeDefined();
    expect(revisionIndex?.config.unique).toBe(true);
  });
});
