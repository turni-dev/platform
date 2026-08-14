import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type { DomainEventEnvelope } from '@turni/contracts';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresDomainEventStore } from '../postgres-domain-event-store.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const eventId = '01900000-0000-7000-8000-000000000003';
const correlationId = '01900000-0000-7000-8000-000000000004';
const createdAt = '2026-08-15T10:00:00.000Z';

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    return Promise.resolve(
      compiled.sql.includes('current_setting') ? [{ tenant_id: tenantId }] : []
    );
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

function envelope(): DomainEventEnvelope {
  return {
    id: eventId,
    tenantId,
    name: 'owner.signed_in',
    version: 1,
    actor: { type: 'owner', id: userId },
    correlationId,
    props: { sessionId: eventId, registration: true },
    createdAt
  };
}

describe('PostgresDomainEventStore', () => {
  it('appends the event inside its own tenant context', async () => {
    const database = new FakeDatabase();

    await new PostgresDomainEventStore(database).append(envelope());

    const queries = database.transactionHandle.queries;
    expect(queries[0]?.sql).toContain('set_config');
    expect(queries[0]?.params).toContain(tenantId);
    expect(queries.at(-1)?.sql).toContain('INSERT INTO events');
  });

  it('sends json columns as text the driver can cast', async () => {
    const database = new FakeDatabase();

    await new PostgresDomainEventStore(database).append(envelope());

    const insert = database.transactionHandle.queries.at(-1);
    expect(insert?.sql).toContain('::jsonb');
    expect(insert?.params).toContain('{"type":"owner","id":"01900000-0000-7000-8000-000000000002"}');
    expect(insert?.params.every((param) => !(param instanceof Date))).toBe(true);
  });

  it('refuses an envelope that does not match the contract', async () => {
    const database = new FakeDatabase();

    await expect(
      new PostgresDomainEventStore(database).append({
        ...envelope(),
        tenantId: 'not-a-uuid'
      })
    ).rejects.toThrow();
    expect(database.transactionHandle.queries).toEqual([]);
  });
});
