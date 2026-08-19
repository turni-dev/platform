import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../database/with-tenant.js';
import { PostgresIdempotencyKeyRepository } from '../postgres-idempotency-key-repository.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const key = '01900000-0000-7000-8000-000000000099';

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public rowsFor: (sql: string) => readonly unknown[] = () => [];
  /** Mirrors Postgres's real `ON CONFLICT (key) DO NOTHING` semantics. */
  public readonly storedKeys = new Set<string>();

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }
    if (compiled.sql.includes('INSERT INTO idempotency_keys')) {
      const insertedKey = compiled.params[0];
      if (typeof insertedKey === 'string' && !this.storedKeys.has(insertedKey)) {
        this.storedKeys.add(insertedKey);
      }

      return Promise.resolve([]);
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
    .map((entry) => entry.sql)
    .filter((sql) => !sql.includes('current_setting') && !sql.includes('set_config'));
}

describe('PostgresIdempotencyKeyRepository', () => {
  it('stores then finds the same row inside a tenant transaction', async () => {
    const database = new FakeDatabase();
    const repository = new PostgresIdempotencyKeyRepository(database);

    await repository.store({
      tenantId,
      key,
      requestHash: 'hash-1',
      statusCode: 201,
      response: { id: 'connection-1' },
      ttlSeconds: 86_400
    });

    expect(statements(database)[0]).toContain('INSERT INTO idempotency_keys');
    expect(statements(database)[0]).toContain('ON CONFLICT');

    database.transactionHandle.rowsFor = (sql) =>
      sql.includes('FROM idempotency_keys')
        ? [
            {
              request_hash: 'hash-1',
              status_code: 201,
              response: { id: 'connection-1' }
            }
          ]
        : [];

    await expect(repository.find({ tenantId, key })).resolves.toEqual({
      requestHash: 'hash-1',
      statusCode: 201,
      response: { id: 'connection-1' }
    });
  });

  it('returns undefined for a key nothing has stored yet', async () => {
    const database = new FakeDatabase();
    const repository = new PostgresIdempotencyKeyRepository(database);

    await expect(repository.find({ tenantId, key })).resolves.toBeUndefined();
  });

  it('does not throw on a second store for the same key, simulating a race', async () => {
    const database = new FakeDatabase();
    const repository = new PostgresIdempotencyKeyRepository(database);
    const attempt = {
      tenantId,
      key,
      requestHash: 'hash-1',
      statusCode: 201,
      response: { id: 'connection-1' },
      ttlSeconds: 86_400
    };

    await repository.store(attempt);

    await expect(repository.store(attempt)).resolves.toBeUndefined();
    expect(statements(database)[1]).toContain('ON CONFLICT');
  });
});
