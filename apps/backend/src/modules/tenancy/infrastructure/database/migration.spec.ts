import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('./migrations/0001_tenancy.sql', import.meta.url);
const billingMigrationUrl = new URL(
  './migrations/0011_tenancy_billing.sql',
  import.meta.url
);

describe('tenancy migration', () => {
  it('creates the complete tenancy table slice', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(
      [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
        (match) => match[1]
      )
    ).toEqual(['tenants', 'locations', 'users', 'sessions', 'auth_codes']);
  });

  it('forces fail-closed RLS on every tenant-scoped table', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    for (const table of ['locations', 'users', 'sessions']) {
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`
      );
      expect(migration).toContain(
        `CREATE POLICY ${table}_tenant_isolation ON ${table}`
      );
    }

    expect(migration).toContain(
      "current_setting('app.tenant_id', true)::uuid"
    );
    expect(migration).not.toMatch(/ALTER TABLE auth_codes .*ROW LEVEL SECURITY/);
  });

  it('requires application-generated UUIDv7 identifiers', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).not.toMatch(/id uuid [^,\n]*DEFAULT/i);
    expect(migration).not.toMatch(/gen_random_uuid|uuid_generate/i);
  });

  it('provisions a non-bypass application role', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE ROLE app_rw NOLOGIN NOBYPASSRLS');
  });

  it('adds billing tables in an expand migration', async () => {
    const migration = await readFile(billingMigrationUrl, 'utf8');

    expect(
      [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
        (match) => match[1]
      )
    ).toEqual(['subscriptions', 'invoices']);
    expect(migration).toContain(
      'subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT'
    );
  });

  it('forces billing RLS and checked text statuses', async () => {
    const migration = await readFile(billingMigrationUrl, 'utf8');

    for (const table of ['subscriptions', 'invoices']) {
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`
      );
      expect(migration).toContain(
        `CREATE POLICY ${table}_tenant_isolation ON ${table}`
      );
    }
    expect(migration).toContain('CONSTRAINT subscriptions_status_check');
    expect(migration).toContain('CONSTRAINT invoices_status_check');
  });
});
