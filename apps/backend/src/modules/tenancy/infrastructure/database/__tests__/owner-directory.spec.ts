import { readFile } from 'node:fs/promises';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { ownerDirectory, tenancyTables } from '../schema.js';

const migrationUrl = new URL('../migrations/0016_owner_directory.sql', import.meta.url);

describe('owner directory migration', () => {
  it('adds a pre-tenant email-to-tenant mapping in an expand migration', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE owner_directory');
    expect(migration).toContain('email citext PRIMARY KEY');
    expect(migration).toContain(
      'tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT'
    );
    expect(migration).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON owner_directory TO app_rw'
    );
    expect(migration).not.toMatch(/DROP|ALTER TABLE (users|tenants|sessions)/);
  });

  it('leaves the mapping readable before a tenant context exists', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).not.toMatch(/owner_directory .*ROW LEVEL SECURITY/);
    expect(migration).not.toContain('CREATE POLICY owner_directory');
  });

  it('registers the table in the tenancy schema without RLS', () => {
    const config = getTableConfig(ownerDirectory);

    expect(config.name).toBe('owner_directory');
    expect(config.enableRLS).toBe(false);
    expect(
      config.columns.find((column) => column.name === 'email')?.getSQLType()
    ).toBe('citext');
    expect(tenancyTables.map((table) => getTableConfig(table).name)).toContain(
      'owner_directory'
    );
  });
});
