import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresOutboundTriggerRepository } from '../postgres-outbound-trigger-repository.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const triggerId = '01900000-0000-7000-8000-000000000002';

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

const triggerRow = {
  id: triggerId,
  tenant_id: tenantId,
  status: 'active',
  consecutive_failures: 0,
  failure_threshold: 3
};

describe('PostgresOutboundTriggerRepository', () => {
  it('reads a trigger inside a tenant context', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [triggerRow];

    const repository = new PostgresOutboundTriggerRepository(database);
    const trigger = await repository.findById(tenantId, triggerId);

    expect(database.transactionHandle.queries[0]?.sql).toContain('set_config');
    expect(statements(database)[0]).toContain('FROM outbound_triggers');
    expect(trigger).toEqual({
      id: triggerId,
      tenantId,
      status: 'active',
      consecutiveFailures: 0,
      failureThreshold: 3
    });
  });

  it('returns undefined when the trigger does not exist for the tenant', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [];

    const repository = new PostgresOutboundTriggerRepository(database);
    const trigger = await repository.findById(tenantId, triggerId);

    expect(trigger).toBeUndefined();
  });

  it('upserts the trigger state on save', async () => {
    const database = new FakeDatabase();
    const repository = new PostgresOutboundTriggerRepository(database);

    await repository.save({
      id: triggerId,
      tenantId,
      status: 'disabled',
      consecutiveFailures: 3,
      failureThreshold: 3
    });

    const [insert] = statements(database);
    expect(insert).toContain('INSERT INTO outbound_triggers');
    expect(insert).toContain('ON CONFLICT (id) DO UPDATE');
    expect(insert).toContain('status');
    expect(insert).toContain('consecutive_failures');
  });
});
