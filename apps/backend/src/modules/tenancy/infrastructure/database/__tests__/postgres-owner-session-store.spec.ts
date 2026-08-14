import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresOwnerSessionStore } from '../postgres-owner-session-store.js';
import type { OwnerSessionRecord } from '../../../application/owner-session-store.port.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const sessionId = '01900000-0000-7000-8000-000000000003';
const tokenHash = new Uint8Array(32).fill(3);
const nextTokenHash = new Uint8Array(32).fill(7);
const now = new Date('2026-08-14T10:00:00.000Z');
const idleExpiresAt = new Date('2026-08-21T10:00:00.000Z');
const absoluteExpiresAt = new Date('2026-09-13T10:00:00.000Z');

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public rows: readonly unknown[] = [];

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }
    if (compiled.sql.includes('FROM sessions') || compiled.sql.includes('RETURNING')) {
      return Promise.resolve(this.rows);
    }
    return Promise.resolve([]);
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

function record(): OwnerSessionRecord {
  return {
    id: sessionId,
    tenantId,
    userId,
    tokenHash,
    idleExpiresAt,
    absoluteExpiresAt
  };
}

function databaseRow(hash: Uint8Array): Record<string, unknown> {
  return {
    id: sessionId,
    tenant_id: tenantId,
    user_id: userId,
    token_hash: hash,
    idle_expires_at: idleExpiresAt,
    absolute_expires_at: absoluteExpiresAt,
    ip: null,
    ua: null
  };
}

function lastQuery(database: FakeDatabase): RecordedQuery {
  const query = database.transactionHandle.queries.at(-1);
  if (query === undefined) throw new Error('Expected a database operation query.');
  return query;
}

function tenantContextWasSet(database: FakeDatabase): boolean {
  return database.transactionHandle.queries.some((query) =>
    query.sql.includes('set_config')
  );
}

describe('PostgresOwnerSessionStore', () => {
  it('inserts a session hash inside its tenant context', async () => {
    const database = new FakeDatabase();
    const store = new PostgresOwnerSessionStore(database);

    await store.insert({ ...record(), ipAddress: '203.0.113.10', userAgent: 'Firefox' });

    expect(tenantContextWasSet(database)).toBe(true);
    expect(lastQuery(database).sql).toContain('INSERT INTO sessions');
    expect(lastQuery(database).params).toContain(tokenHash);
    expect(lastQuery(database).params).toContain('203.0.113.10');
  });

  it('reads only a session that is inside both expiry bounds', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rows = [databaseRow(tokenHash)];
    const store = new PostgresOwnerSessionStore(database);

    await expect(store.findActive({ tenantId, tokenHash, now })).resolves.toEqual(
      record()
    );

    expect(lastQuery(database).sql).toContain('idle_expires_at >');
    expect(lastQuery(database).sql).toContain('absolute_expires_at >');
    expect(lastQuery(database).params).toContain(tenantId);
  });

  it('rotates the predecessor hash away in a single guarded statement', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rows = [databaseRow(nextTokenHash)];
    const store = new PostgresOwnerSessionStore(database);

    await expect(
      store.rotate({ tenantId, currentTokenHash: tokenHash, nextTokenHash, idleExpiresAt, now })
    ).resolves.toEqual({ ...record(), tokenHash: nextTokenHash });

    expect(lastQuery(database).sql).toContain('UPDATE sessions');
    expect(lastQuery(database).sql).toContain('SET token_hash =');
    expect(lastQuery(database).sql).toContain('idle_expires_at >');
    expect(lastQuery(database).sql).toContain('absolute_expires_at >');
    expect(lastQuery(database).params).toContain(tokenHash);
    expect(lastQuery(database).params).toContain(nextTokenHash);
  });

  it('reports a replayed credential as unrotatable', async () => {
    const database = new FakeDatabase();
    const store = new PostgresOwnerSessionStore(database);

    await expect(
      store.rotate({ tenantId, currentTokenHash: tokenHash, nextTokenHash, idleExpiresAt, now })
    ).resolves.toBeUndefined();
  });

  it('revokes the matching tenant session only', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rows = [{ id: sessionId }];
    const store = new PostgresOwnerSessionStore(database);

    await expect(store.revoke({ tenantId, tokenHash })).resolves.toBe(true);

    expect(lastQuery(database).sql).toContain('DELETE FROM sessions');
    expect(lastQuery(database).params).toEqual([tenantId, tokenHash]);
  });
});
