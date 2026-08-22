import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import { PostgresSpendUsageStore } from '../postgres-spend-usage-store.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const runId = '01900000-0000-7000-8000-000000000002';

type RecordedQuery = Readonly<{ sql: string; params: readonly unknown[] }>;

class FakeTransaction implements TenantTransaction {
  public readonly queries: RecordedQuery[] = [];
  public runSpentMicros = 1_000_000n;
  public monthSpentMicros = 5_000_000n;

  public execute(query: SQL): Promise<unknown> {
    const compiled = new PgDialect().sqlToQuery(query);
    this.queries.push({ sql: compiled.sql, params: compiled.params });

    if (compiled.sql.includes('current_setting')) {
      return Promise.resolve([{ tenant_id: tenantId }]);
    }
    if (compiled.sql.includes('INTO agent_run_spend')) {
      return Promise.resolve([{ spent_micros: this.runSpentMicros }]);
    }
    if (compiled.sql.includes('INTO usage_counters')) {
      return Promise.resolve([{ value: this.monthSpentMicros }]);
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

describe('PostgresSpendUsageStore', () => {
  it('accumulates run and month spend atomically inside one tenant transaction', async () => {
    const database = new FakeDatabase();
    const store = new PostgresSpendUsageStore(database);

    const totals = await store.recordSpend({
      tenantId,
      runId,
      month: '2026-08-01',
      amountMicros: 1_000n
    });

    expect(database.transactionCalls).toBe(1);
    expect(totals).toEqual({ runSpentMicros: 1_000_000n, monthSpentMicros: 5_000_000n });

    const [runQuery, monthQuery] = database.transactionHandle.queries.filter((query) =>
      query.sql.includes('INSERT INTO')
    );
    expect(runQuery?.sql).toContain('INSERT INTO agent_run_spend');
    expect(runQuery?.sql).toContain('ON CONFLICT');
    expect(runQuery?.sql).toContain('spent_micros = agent_run_spend.spent_micros + excluded.spent_micros');
    expect(runQuery?.params).toContain(tenantId);
    expect(runQuery?.params).toContain(runId);

    expect(monthQuery?.sql).toContain('INSERT INTO usage_counters');
    expect(monthQuery?.sql).toContain('value = usage_counters.value + excluded.value');
    expect(monthQuery?.params).toContain('llm_spend_micros');
    expect(monthQuery?.params).toContain(tenantId);
    expect(monthQuery?.params).toContain('2026-08-01');
  });
});
