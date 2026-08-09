import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantDatabase, TenantTransaction } from '../../../../../platform/database/with-tenant.js';
import { PostgresGuestSessionStore } from '../postgres-guest-session-store.js';
import type {
  GuestSessionStorePort,
  GuestSessionStoreRecord
} from '../../../application/guest-session-store.port.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const agentId = '01900000-0000-7000-8000-000000000002';
const connectionId = '01900000-0000-7000-8000-000000000003';
const sessionId = '01900000-0000-7000-8000-000000000004';
const tokenHash = new Uint8Array(32).fill(1);
const issuedAt = new Date('2026-08-09T12:00:00.000Z');
const expiresAt = new Date('2026-08-10T12:00:00.000Z');

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public found: readonly unknown[] = [];
  public updated = false;

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }
    if (compiled.sql.includes('FROM guest_sessions')) {
      return Promise.resolve(this.found);
    }
    if (compiled.sql.includes('RETURNING id')) {
      return Promise.resolve(this.updated ? [{ id: sessionId }] : []);
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

function insertInput(): GuestSessionStoreRecord {
  return {
    id: sessionId,
    tenantId,
    agentId,
    connectionId,
    tokenHash,
    tokenKid: 'routing-kid-2026-08',
    issuedAt,
    expiresAt
  };
}

function operationQuery(database: FakeDatabase): RecordedQuery {
  const query = database.transactionHandle.queries.at(-1);
  if (query === undefined) throw new Error('Expected a database operation query.');
  return query;
}

describe('PostgresGuestSessionStore', () => {
  it('inserts a session inside its tenant transaction with a supplied hash only', async () => {
    const database = new FakeDatabase();
    const store = new PostgresGuestSessionStore(database);

    await store.insert(insertInput());

    expect(database.transactionCalls).toBe(1);
    expect(operationQuery(database).sql).toContain('INSERT INTO guest_sessions');
    expect(operationQuery(database).params).toContain(tenantId);
    expect(operationQuery(database).params).toContain(tokenHash);
    expect(operationQuery(database).sql).not.toContain('token text');
  });

  it('looks up only an unrevoked, unexpired session in the tenant context', async () => {
    const database = new FakeDatabase();
    const found: GuestSessionStoreRecord = insertInput();
    database.transactionHandle.found = [
      {
        id: found.id,
        tenant_id: found.tenantId,
        agent_id: found.agentId,
        connection_id: found.connectionId,
        guest_id: null,
        token_hash: found.tokenHash,
        token_kid: found.tokenKid,
        issued_at: found.issuedAt,
        expires_at: found.expiresAt,
        revoked_at: null,
        last_used_at: null,
        created_at: issuedAt
      }
    ];
    const store = new PostgresGuestSessionStore(database);

    await expect(store.findByTokenHash({ tenantId, tokenHash })).resolves.toEqual(found);

    expect(database.transactionCalls).toBe(1);
    expect(operationQuery(database).sql).toContain('revoked_at IS NULL');
    expect(operationQuery(database).sql).toContain('expires_at > now()');
    expect(operationQuery(database).params).toContain(tenantId);
    expect(operationQuery(database).params).toContain(tokenHash);
  });

  it('revokes only the matching tenant session', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.updated = true;
    const store = new PostgresGuestSessionStore(database);
    const input = { tenantId, tokenHash, revokedAt: issuedAt };

    await expect(store.revoke(input)).resolves.toBe(true);

    expect(operationQuery(database).sql).toContain('UPDATE guest_sessions');
    expect(operationQuery(database).sql).toContain('revoked_at IS NULL');
    expect(operationQuery(database).params).toContain(tenantId);
  });

  it('updates last-used only when the tenant session remains valid', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.updated = true;
    const store: GuestSessionStorePort = new PostgresGuestSessionStore(database);
    const input = { tenantId, tokenHash, lastUsedAt: issuedAt };

    await expect(store.markUsedByTokenHash(input)).resolves.toBe(true);

    expect(operationQuery(database).sql).toContain('SET last_used_at');
    expect(operationQuery(database).sql).toContain('revoked_at IS NULL');
    expect(operationQuery(database).sql).toContain('expires_at >');
    expect(operationQuery(database).params).toContain(tenantId);
  });
});
