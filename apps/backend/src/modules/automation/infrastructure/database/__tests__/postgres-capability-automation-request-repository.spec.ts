import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import type { CapabilityAutomationRequest } from '../../../domain/capability-automation-request.js';
import { PostgresCapabilityAutomationRequestRepository } from '../postgres-capability-automation-request-repository.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const requestId = '01900000-0000-7000-8000-000000000002';
const agentId = '01900000-0000-7000-8000-000000000003';
const connectionId = '01900000-0000-7000-8000-000000000004';
const ownerId = '01900000-0000-7000-8000-000000000005';

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

const row = {
  id: requestId,
  tenant_id: tenantId,
  agent_id: agentId,
  connection_id: connectionId,
  channel: 'vk',
  guest_ref: 'vk:1',
  idempotency_key: 'key-1',
  status: 'pending_approval',
  calendar_summary: 'Запишите меня на встречу',
  calendar_starts_at: new Date('2026-08-22T18:00:00.000Z'),
  calendar_ends_at: new Date('2026-08-22T19:00:00.000Z'),
  calendar_event_id: null,
  sheets_appended: false,
  decided_by: null,
  decided_at: null,
  created_at: new Date('2026-08-22T10:00:00.000Z'),
  updated_at: new Date('2026-08-22T10:00:00.000Z')
};

const domainRequest: CapabilityAutomationRequest = {
  id: requestId,
  tenantId,
  agentId,
  connectionId,
  channel: 'vk',
  guestRef: 'vk:1',
  idempotencyKey: 'key-1',
  status: 'pending_approval',
  calendarInput: {
    summary: 'Запишите меня на встречу',
    startsAt: '2026-08-22T18:00:00.000Z',
    endsAt: '2026-08-22T19:00:00.000Z'
  },
  calendarEventId: undefined,
  sheetsAppended: false,
  decidedBy: undefined,
  decidedAt: undefined,
  createdAt: '2026-08-22T10:00:00.000Z',
  updatedAt: '2026-08-22T10:00:00.000Z'
};

describe('PostgresCapabilityAutomationRequestRepository', () => {
  it('reads a request inside a tenant context', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [row];

    const repository = new PostgresCapabilityAutomationRequestRepository(database);
    const found = await repository.findById(tenantId, requestId);

    expect(database.transactionHandle.queries[0]?.sql).toContain('set_config');
    expect(statements(database)[0]).toContain('FROM capability_automation_requests');
    expect(found).toEqual(domainRequest);
  });

  it('creates a new pending request via INSERT ... ON CONFLICT DO NOTHING RETURNING', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = (sql) => (sql.includes('INSERT') ? [row] : []);

    const repository = new PostgresCapabilityAutomationRequestRepository(database);
    const result = await repository.create(domainRequest);

    const [insert] = statements(database);
    expect(insert).toContain('INSERT INTO capability_automation_requests');
    expect(insert).toContain('ON CONFLICT (tenant_id, idempotency_key) DO NOTHING');
    expect(result).toEqual({ request: domainRequest, created: true });
  });

  it('returns the existing row (created: false) on an idempotency-key conflict', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = (sql) => (sql.includes('INSERT') ? [] : [row]);

    const repository = new PostgresCapabilityAutomationRequestRepository(database);
    const result = await repository.create(domainRequest);

    expect(result).toEqual({ request: domainRequest, created: false });
  });

  it('approves only a pending_approval row, guarded by a WHERE status IN (...) clause', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [{ ...row, status: 'approved', decided_by: ownerId }];

    const repository = new PostgresCapabilityAutomationRequestRepository(database);
    const approved = await repository.approve(tenantId, requestId, ownerId, '2026-08-22T11:00:00.000Z');

    const [update] = statements(database);
    const updateQuery = database.transactionHandle.queries.find((query) =>
      query.sql.includes('UPDATE capability_automation_requests')
    );
    expect(update).toContain('UPDATE capability_automation_requests');
    expect(update).toMatch(/status IN \(\$\d+\)/);
    expect(updateQuery?.params).toContain('pending_approval');
    expect(approved?.status).toBe('approved');
  });

  it('returns undefined from claimForExecution when nothing matched (idempotency guard)', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.rowsFor = () => [];

    const repository = new PostgresCapabilityAutomationRequestRepository(database);
    const claimed = await repository.claimForExecution(tenantId, requestId);

    const [update] = statements(database);
    const updateQuery = database.transactionHandle.queries.find((query) =>
      query.sql.includes('UPDATE capability_automation_requests')
    );
    expect(update).toMatch(/status IN \(\$\d+, \$\d+\)/);
    expect(updateQuery?.params).toEqual(expect.arrayContaining(['approved', 'failed']));
    expect(claimed).toBeUndefined();
  });

  it('marks the calendar event id without touching status', async () => {
    const database = new FakeDatabase();

    const repository = new PostgresCapabilityAutomationRequestRepository(database);
    await repository.markCalendarCreated(tenantId, requestId, 'evt-1');

    const [update] = statements(database);
    expect(update).toContain('SET calendar_event_id');
  });
});
