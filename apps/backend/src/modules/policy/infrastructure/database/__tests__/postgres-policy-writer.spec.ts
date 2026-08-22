import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import type { TenantDatabase, TenantTransaction } from '../../../../../platform/database/with-tenant.js';
import type { PolicyRow } from '../../../application/policy-provisioning.port.js';
import { PostgresPolicyWriter } from '../postgres-policy-writer.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const agentId = '01900000-0000-7000-8000-000000000002';

const ROW: PolicyRow = {
  path: 'allergen-health-lock',
  layer: 'locked',
  compiled: {
    ruleId: 'allergen-health-lock',
    target: { type: 'keyword', source: 'аллерги\\S*', flags: 'iu' },
    verdict: 'approval',
    riskScore: 10,
    approvalRequired: true,
    allowlist: undefined,
    budgetLimit: undefined
  }
};

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public selectResult: readonly Record<string, unknown>[] = [];
  public insertResult: readonly Record<string, unknown>[] = [{ path: ROW.path }];

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }
    if (compiled.sql.trim().startsWith('SELECT path, layer, compiled')) {
      return Promise.resolve(this.selectResult);
    }
    if (compiled.sql.includes('INSERT INTO policies')) {
      return Promise.resolve(this.insertResult);
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

describe('PostgresPolicyWriter', () => {
  it('inserts a compiled policy row and reports it was inserted', async () => {
    const database = new FakeDatabase();
    const writer = new PostgresPolicyWriter(database, { next: () => '01900000-0000-7000-8000-00000000000f' });

    const inserted = await writer.insertIfAbsent({ tenantId, agentId }, ROW);

    expect(inserted).toBe(true);
    const insertQuery = database.transactionHandle.queries.find((query) => query.sql.includes('INSERT INTO policies'));
    expect(insertQuery?.sql).toContain('ON CONFLICT (agent_id, path) DO NOTHING');
    expect(insertQuery?.sql).toContain('RETURNING path');
    expect(insertQuery?.params).toContain(tenantId);
    expect(insertQuery?.params).toContain(agentId);
    expect(insertQuery?.params).toContain(ROW.path);
  });

  it('reports no insertion when the conflict target already exists', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.insertResult = [];
    const writer = new PostgresPolicyWriter(database, { next: () => '01900000-0000-7000-8000-00000000000f' });

    const inserted = await writer.insertIfAbsent({ tenantId, agentId }, ROW);

    expect(inserted).toBe(false);
  });

  it('finds an existing row by path and projects it back into the domain shape', async () => {
    const database = new FakeDatabase();
    database.transactionHandle.selectResult = [
      { path: ROW.path, layer: ROW.layer, compiled: ROW.compiled }
    ];
    const writer = new PostgresPolicyWriter(database);

    const found = await writer.findByPath({ tenantId, agentId }, ROW.path);

    expect(found).toEqual(ROW);
  });

  it('returns undefined when no row exists for the path', async () => {
    const database = new FakeDatabase();
    const writer = new PostgresPolicyWriter(database);

    const found = await writer.findByPath({ tenantId, agentId }, 'missing-path');

    expect(found).toBeUndefined();
  });
});
