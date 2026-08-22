import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { TenantDatabase, TenantTransaction } from '../../../../../platform/database/with-tenant.js';
import { PostgresPolicyProvisioningTracker } from '../postgres-policy-provisioning-tracker.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const agentId = '01900000-0000-7000-8000-000000000002';

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public selectResult: readonly Record<string, unknown>[] = [];

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }
    if (compiled.sql.includes('FROM policy_provisioning')) {
      return Promise.resolve(this.selectResult);
    }
    return Promise.resolve([]);
  }
}

class FakeDatabase implements TenantDatabase {
  public readonly transactionHandle = new FakeTransaction();

  public async transaction<T>(operation: (transaction: TenantTransaction) => Promise<T>): Promise<T> {
    return operation(this.transactionHandle);
  }
}

describe('PostgresPolicyProvisioningTracker', () => {
  it('returns undefined when no status has been recorded yet', async () => {
    const database = new FakeDatabase();
    const tracker = new PostgresPolicyProvisioningTracker(database);

    const status = await tracker.getStatus({ tenantId, agentId });

    expect(status).toBeUndefined();
  });

  it('projects a stored row into the domain status shape', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.selectResult = [
      { defaults_version: '2026-08-22.1', defaults_fingerprint: 'abc123' }
    ];
    const tracker = new PostgresPolicyProvisioningTracker(database);

    const status = await tracker.getStatus({ tenantId, agentId });

    expect(status).toEqual({ version: '2026-08-22.1', fingerprint: 'abc123' });
  });

  it('upserts the provisioning status keyed by (tenant, agent)', async () => {
    const database = new FakeDatabase();
    const tracker = new PostgresPolicyProvisioningTracker(database);

    await tracker.recordStatus({ tenantId, agentId }, { version: 'v2', fingerprint: 'def456' });

    const upsertQuery = database.transactionHandle.queries.find((query) =>
      query.sql.includes('INSERT INTO policy_provisioning')
    );
    expect(upsertQuery?.sql).toContain('ON CONFLICT (tenant_id, agent_id) DO UPDATE SET');
    expect(upsertQuery?.params).toContain(tenantId);
    expect(upsertQuery?.params).toContain(agentId);
    expect(upsertQuery?.params).toContain('v2');
    expect(upsertQuery?.params).toContain('def456');
  });
});
