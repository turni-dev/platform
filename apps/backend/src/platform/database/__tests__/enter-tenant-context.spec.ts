import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { enterTenantContext, type TenantTransaction } from '../with-tenant.js';

const tenantId = '01900000-0000-7000-8000-000000000001';

class FakeTransaction implements TenantTransaction {
  public readonly statements: string[] = [];
  public contextTenantId: string | null = tenantId;

  public execute(query: SQL): Promise<unknown> {
    this.statements.push(new PgDialect().sqlToQuery(query).sql);
    if (this.statements.length === 2) {
      return Promise.resolve([{ tenant_id: this.contextTenantId }]);
    }
    return Promise.resolve([]);
  }
}

describe('enterTenantContext', () => {
  it('sets and verifies the context of an already open transaction', async () => {
    const transaction = new FakeTransaction();

    await expect(enterTenantContext(transaction, tenantId)).resolves.toBe(tenantId);
    expect(transaction.statements).toEqual([
      "SELECT set_config('app.tenant_id', $1, true)",
      "SELECT current_setting('app.tenant_id', true) AS tenant_id"
    ]);
  });

  it('fails closed on a mismatched context and on an invalid identifier', async () => {
    const mismatched = new FakeTransaction();
    mismatched.contextTenantId = '01900000-0000-7000-8000-000000000002';

    await expect(enterTenantContext(mismatched, tenantId)).rejects.toThrow(
      'Tenant context assertion failed'
    );

    const untouched = new FakeTransaction();
    await expect(enterTenantContext(untouched, 'not-a-uuid')).rejects.toThrow();
    expect(untouched.statements).toEqual([]);
  });
});
