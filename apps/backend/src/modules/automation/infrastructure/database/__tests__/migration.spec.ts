import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../migrations/0022_automation.sql', import.meta.url);

describe('automation migration', () => {
  it('creates the outbound_triggers table scoped to a tenant with a uuid id', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE outbound_triggers');
    expect(migration).toContain('id uuid PRIMARY KEY');
    expect(migration).toContain('tenant_id uuid NOT NULL REFERENCES tenants(id)');
  });

  it('uses text plus CHECK for status instead of an enum', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      "status text NOT NULL DEFAULT 'active'"
    );
    expect(migration).toContain("CHECK (status IN ('active', 'disabled'))");
    expect(migration).not.toMatch(/CREATE TYPE/);
  });

  it('constrains the failure counter and threshold to sane values', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CHECK (failure_threshold > 0)');
    expect(migration).toContain('CHECK (consecutive_failures >= 0)');
  });

  it('forces row level security with a tenant isolation policy', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('ALTER TABLE outbound_triggers ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE outbound_triggers FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY outbound_triggers_tenant_isolation ON outbound_triggers');
    expect(migration).toContain("current_setting('app.tenant_id', true)");
  });

  it('grants only the columns app_rw needs, no delete', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'GRANT SELECT, INSERT, UPDATE ON outbound_triggers TO app_rw'
    );
    expect(migration).not.toContain('DELETE ON outbound_triggers TO app_rw');
  });
});
