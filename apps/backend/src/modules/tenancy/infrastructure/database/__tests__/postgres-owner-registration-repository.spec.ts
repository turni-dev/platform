import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresOwnerRegistrationRepository } from '../postgres-owner-registration-repository.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const email = 'owner@turni.ru';
const tenantName = 'Кафе Пример';

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public failOnUsersInsert = false;

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }
    if (compiled.sql.includes('INSERT INTO users') && this.failOnUsersInsert) {
      return Promise.reject(new Error('duplicate key value violates unique constraint'));
    }
    return Promise.resolve([]);
  }
}

class FakeDatabase implements TenantDatabase {
  public readonly transactionHandle = new FakeTransaction();
  public transactionCalls = 0;

  public async transaction<T>(
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T> {
    this.transactionCalls += 1;
    return operation(this.transactionHandle);
  }
}

function statementOrder(database: FakeDatabase): readonly string[] {
  const markers = [
    ['INSERT INTO tenants', 'tenants'],
    ["set_config('app.tenant_id'", 'set-context'],
    ["current_setting('app.tenant_id'", 'assert-context'],
    ['INSERT INTO users', 'users']
  ] as const;

  return database.transactionHandle.queries.flatMap(
    (query) =>
      markers.filter(([marker]) => query.sql.includes(marker)).map(([, name]) => name)
  );
}

describe('PostgresOwnerRegistrationRepository', () => {
  it('creates the tenant, enters its context, then creates the owner in one transaction', async () => {
    const database = new FakeDatabase();
    const repository = new PostgresOwnerRegistrationRepository(database);

    await repository.createTenantWithOwner({
      tenantId,
      userId,
      tenantName,
      email: '  Owner@Turni.RU '
    });

    expect(database.transactionCalls).toBe(1);
    expect(statementOrder(database)).toEqual([
      'tenants',
      'set-context',
      'assert-context',
      'users'
    ]);
    const ownerInsert = database.transactionHandle.queries.at(-1);
    expect(ownerInsert?.params).toContain(email);
    expect(ownerInsert?.params).toContain('owner');
    expect(ownerInsert?.params).not.toContain('  Owner@Turni.RU ');
  });

  it('creates the tenant only after the name passes validation', async () => {
    const database = new FakeDatabase();
    const repository = new PostgresOwnerRegistrationRepository(database);

    await expect(
      repository.createTenantWithOwner({ tenantId, userId, tenantName: '  ', email })
    ).rejects.toThrow();
    expect(database.transactionCalls).toBe(0);
  });

  it('propagates a failed owner insert so the whole registration rolls back', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.failOnUsersInsert = true;
    const repository = new PostgresOwnerRegistrationRepository(database);

    await expect(
      repository.createTenantWithOwner({ tenantId, userId, tenantName, email })
    ).rejects.toThrow('duplicate key value violates unique constraint');
  });
});
