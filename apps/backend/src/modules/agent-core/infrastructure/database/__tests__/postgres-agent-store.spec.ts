import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresAgentFileStore } from '../postgres-agent-file-store.js';
import { PostgresAgentRepository } from '../postgres-agent-repository.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const agentId = '01900000-0000-7000-8000-000000000002';
const userId = '01900000-0000-7000-8000-000000000003';
const fileId = '01900000-0000-7000-8000-000000000004';
const revisionId = '01900000-0000-7000-8000-000000000005';

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public rowsFor: (sql: string) => readonly unknown[] = () => [];

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }

    return Promise.resolve(this.rowsFor(compiled.sql));
  }
}

class FakeDatabase implements TenantDatabase {
  public readonly transactionHandle = new FakeTransaction();

  public async transaction<T>(
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T> {
    return operation(this.transactionHandle);
  }
}

function statements(database: FakeDatabase): readonly string[] {
  return database.transactionHandle.queries
    .map((query) => query.sql)
    .filter((sql) => !sql.includes('current_setting') && !sql.includes('set_config'));
}

describe('PostgresAgentRepository', () => {
  it('reads the tenant agent inside a tenant context and ignores deleted rows', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [
      {
        id: agentId,
        name: 'Кофейня',
        template: 'dining',
        status: 'draft',
        autonomy: { presets: ['telegram.reply'] }
      }
    ];

    const agent = await new PostgresAgentRepository(database).findByTenant(tenantId);

    expect(database.transactionHandle.queries[0]?.sql).toContain('set_config');
    expect(statements(database)[0]).toContain('FROM agents');
    expect(statements(database)[0]).toContain('deleted_at IS NULL');
    expect(agent).toEqual({
      agentId,
      tenantId,
      name: 'Кофейня',
      template: 'dining',
      status: 'draft',
      automations: { presets: ['telegram.reply'] }
    });
  });

  it('reads an allowlist stored as json text, because the driver returns text', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [
      {
        id: agentId,
        name: 'Кофейня',
        template: 'dining',
        status: 'draft',
        autonomy: '{"presets":["telegram.reply"]}'
      }
    ];

    const agent = await new PostgresAgentRepository(database).findByTenant(tenantId);

    expect(agent?.automations).toEqual({ presets: ['telegram.reply'] });
  });

  it('sends the allowlist as json the driver can cast', async () => {
    const database = new FakeDatabase();

    await new PostgresAgentRepository(database).saveAutomations({
      tenantId,
      agentId,
      presets: ['telegram.reply']
    });

    const update = statements(database).at(-1);
    expect(update).toContain('UPDATE agents');
    expect(update).toContain('::jsonb');
    expect(database.transactionHandle.queries.at(-1)?.params).toContain(
      '{"presets":["telegram.reply"]}'
    );
  });
});

describe('PostgresAgentFileStore', () => {
  it('writes the file and its revision in one transaction', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = (sql) =>
      sql.includes('INSERT INTO memory_files') ? [{ id: fileId }] : [];

    await new PostgresAgentFileStore(database).saveRevision({
      tenantId,
      agentId,
      fileId,
      revisionId,
      path: 'knowledge/menu.md',
      revision: 2,
      content: 'Эспрессо',
      authorUserId: userId
    });

    const written = statements(database);
    expect(written[0]).toContain('INSERT INTO memory_files');
    expect(written[0]).toContain('ON CONFLICT');
    expect(written[1]).toContain('INSERT INTO memory_revisions');
    expect(written[1]).toContain('RETURNING');
  });

  it('keeps the existing file id when the file already existed', async () => {
    const database = new FakeDatabase();
    const existingFileId = '01900000-0000-7000-8000-000000000009';
    database.transactionHandle.rowsFor = (sql) =>
      sql.includes('INSERT INTO memory_files') ? [{ id: existingFileId }] : [];

    await new PostgresAgentFileStore(database).saveRevision({
      tenantId,
      agentId,
      fileId,
      revisionId,
      path: 'knowledge/menu.md',
      revision: 2,
      content: 'Эспрессо',
      authorUserId: userId
    });

    expect(database.transactionHandle.queries.at(-1)?.params).toContain(existingFileId);
  });

  it('records the owner as the author of their own edit', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = (sql) =>
      sql.includes('INSERT INTO memory_files') ? [{ id: fileId }] : [];

    await new PostgresAgentFileStore(database).saveRevision({
      tenantId,
      agentId,
      fileId,
      revisionId,
      path: 'knowledge/menu.md',
      revision: 1,
      content: 'Эспрессо',
      authorUserId: userId
    });

    expect(database.transactionHandle.queries.at(-1)?.params).toContain('owner');
    expect(database.transactionHandle.queries.at(-1)?.params).toContain(userId);
  });

  it('reads a file together with the revision it currently points at', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [
      { path: 'knowledge/menu.md', current_rev: 3, content: 'Эспрессо' }
    ];

    const file = await new PostgresAgentFileStore(database).read({
      tenantId,
      agentId,
      path: 'knowledge/menu.md'
    });

    expect(statements(database)[0]).toContain('JOIN memory_revisions');
    expect(file).toEqual({ path: 'knowledge/menu.md', revision: 3, content: 'Эспрессо' });
  });

  it('lists the index without carrying any content', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [
      { path: 'knowledge/menu.md', current_rev: 2 }
    ];

    const index = await new PostgresAgentFileStore(database).list({ tenantId, agentId });

    expect(statements(database)[0]).not.toContain('content');
    expect(index).toEqual([{ path: 'knowledge/menu.md', revision: 2 }]);
  });

  it('removes a file by marking it deleted, so its history survives', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [{ id: fileId }];

    const removed = await new PostgresAgentFileStore(database).remove({
      tenantId,
      agentId,
      path: 'knowledge/menu.md'
    });

    expect(statements(database)[0]).toContain('UPDATE memory_files');
    expect(statements(database)[0]).toContain('deleted_at');
    expect(removed).toBe(true);
  });

  it('reports nothing removed when the file was already gone', async () => {
    const database = new FakeDatabase();

    await expect(
      new PostgresAgentFileStore(database).remove({
        tenantId,
        agentId,
        path: 'knowledge/menu.md'
      })
    ).resolves.toBe(false);
  });
});
