import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresOwnerAuthChallengeStore } from '../postgres-owner-auth-challenge-store.js';
import { maxOwnerAuthAttempts } from '../../../domain/owner-auth-challenge.js';
import type { OwnerAuthChallengeRecord } from '../../../application/owner-auth-challenge-store.port.js';

const challengeId = '01900000-0000-7000-8000-000000000001';
const email = 'owner@turni.ru';
const codeHash = 'a'.repeat(43);
const now = new Date('2026-08-14T10:00:00.000Z');
const expiresAt = new Date('2026-08-14T10:05:00.000Z');

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public found: readonly unknown[] = [];
  public updated: readonly unknown[] = [];

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('FROM auth_codes')) {
      return Promise.resolve(this.found);
    }
    if (compiled.sql.includes('RETURNING')) {
      return Promise.resolve(this.updated);
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

function lastQuery(database: FakeDatabase): RecordedQuery {
  const query = database.transactionHandle.queries.at(-1);
  if (query === undefined) throw new Error('Expected a database operation query.');
  return query;
}

function record(): OwnerAuthChallengeRecord {
  return { id: challengeId, email, codeHash, attempts: 0, expiresAt };
}

describe('PostgresOwnerAuthChallengeStore', () => {
  it('inserts a hash-only challenge for the normalized email', async () => {
    const database = new FakeDatabase();
    const store = new PostgresOwnerAuthChallengeStore(database);

    await store.insert({ ...record(), email: '  Owner@Turni.RU ' });

    expect(database.transactionCalls).toBe(1);
    expect(lastQuery(database).sql).toContain('INSERT INTO auth_codes');
    expect(lastQuery(database).params).toEqual([challengeId, email, codeHash, expiresAt.toISOString()]);
  });

  it('reads only an unconsumed, unexpired challenge for the email', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.found = [
      {
        id: challengeId,
        email,
        code_hash: codeHash,
        attempts: 2,
        // The driver hands timestamps back as text, never as Date instances.
        expires_at: expiresAt.toISOString(),
        consumed_at: null
      }
    ];
    const store = new PostgresOwnerAuthChallengeStore(database);

    await expect(store.findActiveByEmail({ email, now })).resolves.toEqual({
      ...record(),
      attempts: 2
    });

    expect(lastQuery(database).sql).toContain('consumed_at IS NULL');
    expect(lastQuery(database).sql).toContain('expires_at >');
    expect(lastQuery(database).sql).toContain('ORDER BY created_at DESC');
    expect(lastQuery(database).params).toEqual([email, now.toISOString()]);
  });

  it('returns nothing when no active challenge exists', async () => {
    const database = new FakeDatabase();
    const store = new PostgresOwnerAuthChallengeStore(database);

    await expect(store.findActiveByEmail({ email, now })).resolves.toBeUndefined();
  });

  it('increments attempts atomically while the challenge is still usable', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.updated = [{ attempts: 3 }];
    const store = new PostgresOwnerAuthChallengeStore(database);

    await expect(store.incrementAttempts({ id: challengeId, now })).resolves.toBe(3);

    expect(lastQuery(database).sql).toContain('SET attempts = attempts + 1');
    expect(lastQuery(database).sql).toContain('attempts <');
    expect(lastQuery(database).sql).toContain('consumed_at IS NULL');
    expect(lastQuery(database).sql).toContain('RETURNING attempts');
    expect(lastQuery(database).params).toEqual([challengeId, now.toISOString(), maxOwnerAuthAttempts]);
  });

  it('reports an exhausted challenge when no row is incremented', async () => {
    const database = new FakeDatabase();
    const store = new PostgresOwnerAuthChallengeStore(database);

    await expect(
      store.incrementAttempts({ id: challengeId, now })
    ).resolves.toBeUndefined();
  });

  it('consumes a challenge exactly once', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.updated = [{ id: challengeId }];
    const store = new PostgresOwnerAuthChallengeStore(database);

    await expect(store.consume({ id: challengeId, consumedAt: now })).resolves.toBe(true);

    expect(lastQuery(database).sql).toContain('UPDATE auth_codes');
    expect(lastQuery(database).sql).toContain('consumed_at IS NULL');
    expect(lastQuery(database).sql).toContain('expires_at >');
    expect(lastQuery(database).params).toEqual([now.toISOString(), challengeId, now.toISOString()]);

    database.transactionHandle.updated = [];
    await expect(store.consume({ id: challengeId, consumedAt: now })).resolves.toBe(false);
  });
});
