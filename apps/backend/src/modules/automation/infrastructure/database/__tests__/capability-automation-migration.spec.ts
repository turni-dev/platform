import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/0025_capability_automation.sql', import.meta.url);

describe('capability automation migration', () => {
  it('creates the capability_automation_requests table scoped to a tenant with a uuid id', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE capability_automation_requests');
    expect(migration).toContain('id uuid PRIMARY KEY');
    expect(migration).toContain('tenant_id uuid NOT NULL REFERENCES tenants(id)');
  });

  it('uses text plus CHECK for status and channel instead of enums', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      "status text NOT NULL DEFAULT 'pending_approval'"
    );
    expect(migration).toContain(
      "CHECK (status IN (\n      'pending_approval', 'approved', 'rejected', 'executing', 'executed', 'failed'\n    ))"
    );
    expect(migration).toContain("CHECK (channel IN ('vk'))");
    expect(migration).not.toMatch(/CREATE TYPE/);
  });

  it('deduplicates by tenant + idempotency key so a retry cannot create a second request', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('UNIQUE (tenant_id, idempotency_key)');
  });

  it('forces row level security with a tenant isolation policy', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'ALTER TABLE capability_automation_requests ENABLE ROW LEVEL SECURITY'
    );
    expect(migration).toContain(
      'ALTER TABLE capability_automation_requests FORCE ROW LEVEL SECURITY'
    );
    expect(migration).toContain(
      'CREATE POLICY capability_automation_requests_tenant_isolation ON capability_automation_requests'
    );
    expect(migration).toContain("current_setting('app.tenant_id', true)");
  });

  it('grants only the columns app_rw needs, no delete', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'GRANT SELECT, INSERT, UPDATE ON capability_automation_requests TO app_rw'
    );
    expect(migration).not.toContain('DELETE ON capability_automation_requests TO app_rw');
  });
});
