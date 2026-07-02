import { PgDialect } from 'drizzle-orm/pg-core';
import { sql, type SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  type TenantDatabase,
  type TenantTransaction,
  withTenant
} from './with-tenant.js';

const tenantId = '01900000-0000-7000-8000-000000000001';

class FakeTransaction implements TenantTransaction {
  readonly statements: string[] = [];
  contextTenantId: string | null = tenantId;

  execute(query: SQL): Promise<unknown> {
    this.statements.push(new PgDialect().sqlToQuery(query).sql);
    if (this.statements.length === 2) {
      return Promise.resolve([{ tenant_id: this.contextTenantId }]);
    }
    return Promise.resolve([]);
  }
}

class FakeDatabase implements TenantDatabase {
  readonly transactionHandle = new FakeTransaction();
  transactionCalls = 0;

  async transaction<T>(
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T> {
    this.transactionCalls += 1;
    return operation(this.transactionHandle);
  }
}

describe('withTenant', () => {
  it('sets and verifies transaction-local context before business SQL', async () => {
    const database = new FakeDatabase();

    const result = await withTenant(database, tenantId, async (transaction) => {
      await transaction.execute(sql`SELECT 1`);
      return 'done';
    });

    expect(result).toBe('done');
    expect(database.transactionHandle.statements).toEqual([
      "SELECT set_config('app.tenant_id', $1, true)",
      "SELECT current_setting('app.tenant_id', true) AS tenant_id",
      'SELECT 1'
    ]);
  });

  it('rejects invalid tenant identifiers before opening a transaction', async () => {
    const database = new FakeDatabase();

    await expect(
      withTenant(database, 'not-a-uuid', () => Promise.resolve(undefined))
    )
      .rejects.toThrow();
    expect(database.transactionCalls).toBe(0);
  });

  it('fails closed when PostgreSQL reports a different context', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.contextTenantId =
      '01900000-0000-7000-8000-000000000002';

    await expect(
      withTenant(database, tenantId, () => Promise.resolve(undefined))
    )
      .rejects.toThrow('Tenant context assertion failed');
  });
});
