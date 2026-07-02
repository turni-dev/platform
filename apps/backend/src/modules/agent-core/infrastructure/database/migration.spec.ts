import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  './migrations/0002_agent_core.sql',
  import.meta.url
);

describe('agent-core migration', () => {
  it('creates the complete agent-core table slice', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(
      [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
        (match) => match[1]
      )
    ).toEqual(['agents', 'actions', 'bookings', 'idempotency_keys']);
  });

  it('forces tenant isolation on every table', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    for (const table of [
      'agents',
      'actions',
      'bookings',
      'idempotency_keys'
    ]) {
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`
      );
      expect(migration).toContain(
        `CREATE POLICY ${table}_tenant_isolation ON ${table}`
      );
    }
  });

  it('uses restrictive references to available tenancy tables', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'created_by uuid REFERENCES users(id) ON DELETE RESTRICT'
    );
  });

  it('keeps UUIDv7 generation in the application', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).not.toMatch(/id uuid [^,\n]*DEFAULT/i);
    expect(migration).not.toMatch(/gen_random_uuid|uuid_generate/i);
  });
});
