import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector
} from 'drizzle-orm/pg-core';

const tenantSetting = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;
const id = () => uuid('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const memoryFiles = pgTable(
  'memory_files',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    path: text('path').notNull(),
    currentRevision: integer('current_rev').default(1).notNull(),
    status: text('status').default('active').notNull(),
    pinToContext: boolean('pin_to_context').default(false).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'memory_files_current_rev_check',
      sql`${table.currentRevision} > 0`
    ),
    check(
      'memory_files_status_check',
      sql`${table.status} in ('active', 'pending_approval', 'archived')`
    ),
    uniqueIndex('memory_files_agent_path_active_uidx')
      .on(table.agentId, table.path)
      .where(sql`${table.deletedAt} is null`),
    index('memory_files_tenant_agent_idx').on(
      table.tenantId,
      table.agentId
    ),
    pgPolicy('memory_files_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const memoryRevisions = pgTable(
  'memory_revisions',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => memoryFiles.id, { onDelete: 'cascade' }),
    revision: integer('rev').notNull(),
    content: text('content').notNull(),
    author: text('author').notNull(),
    sourceApprovalId: uuid('source_approval_id'),
    createdBy: uuid('created_by'),
    createdAt: createdAt()
  },
  (table) => [
    check('memory_revisions_rev_check', sql`${table.revision} > 0`),
    check(
      'memory_revisions_author_check',
      sql`${table.author} in ('owner', 'agent', 'system')`
    ),
    uniqueIndex('memory_revisions_file_rev_uidx').on(
      table.fileId,
      table.revision
    ),
    index('memory_revisions_tenant_file_idx').on(
      table.tenantId,
      table.fileId
    ),
    pgPolicy('memory_revisions_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const memoryChunks = pgTable(
  'memory_chunks',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    fileId: uuid('file_id').notNull(),
    revision: integer('rev').notNull(),
    index: integer('idx').notNull(),
    headingPath: text('heading_path'),
    content: text('text').notNull(),
    tokens: integer('tokens'),
    embedding: vector('embedding', { dimensions: 768 }),
    embeddingModel: text('embedding_model').notNull(),
    createdAt: createdAt()
  },
  (table) => [
    check('memory_chunks_rev_check', sql`${table.revision} > 0`),
    check('memory_chunks_idx_check', sql`${table.index} >= 0`),
    foreignKey({
      name: 'memory_chunks_file_rev_revisions_fk',
      columns: [table.fileId, table.revision],
      foreignColumns: [memoryRevisions.fileId, memoryRevisions.revision]
    }).onDelete('cascade'),
    uniqueIndex('memory_chunks_file_rev_idx_uidx').on(
      table.fileId,
      table.revision,
      table.index
    ),
    index('memory_chunks_tenant_file_idx').on(
      table.tenantId,
      table.fileId
    ),
    index('memory_chunks_embedding_hnsw_idx')
      .using('hnsw', table.embedding.op('vector_cosine_ops'))
      .with({ m: 16, ef_construction: 64 })
      .where(sql`${table.embeddingModel} = 'yandex:text-embeddings-v2-doc:768'`),
    pgPolicy('memory_chunks_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const memoryTables = [
  memoryFiles,
  memoryRevisions,
  memoryChunks
] as const;
