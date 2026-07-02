import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { locations } from '../../modules/tenancy/infrastructure/database/schema.js';
import { withTenant } from './with-tenant.js';

const databaseUrl = process.env['RLS_TEST_DATABASE_URL'];
const tenantA = '01900000-0000-7000-8000-00000000000a';
const tenantB = '01900000-0000-7000-8000-00000000000b';
const locationA = '01900000-0000-7000-8000-00000000001a';
const locationB = '01900000-0000-7000-8000-00000000001b';

describe.skipIf(databaseUrl === undefined)('tenant RLS integration', () => {
  let adminClient: Sql;
  let appClient: Sql;
  let database: PostgresJsDatabase;
  let seeded = false;

  beforeAll(async () => {
    adminClient = postgres(databaseUrl!, { max: 1 });
    appClient = postgres(databaseUrl!, { max: 1 });
    database = drizzle(appClient);

    await adminClient`DELETE FROM locations WHERE id IN (${locationA}, ${locationB})`;
    await adminClient`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`;
    await adminClient`
      INSERT INTO tenants (id, name) VALUES
        (${tenantA}, 'RLS tenant A'),
        (${tenantB}, 'RLS tenant B')
    `;
    seeded = true;
    await appClient`SET ROLE app_rw`;
  });

  afterAll(async () => {
    if (appClient !== undefined) {
      await appClient.end({ timeout: 5 });
    }
    if (adminClient !== undefined && seeded) {
      await adminClient`DELETE FROM locations WHERE id IN (${locationA}, ${locationB})`;
      await adminClient`DELETE FROM tenants WHERE id IN (${tenantA}, ${tenantB})`;
    }
    if (adminClient !== undefined) {
      await adminClient.end({ timeout: 5 });
    }
  });

  it('shows no tenant rows without transaction context', async () => {
    const rows = await database.select().from(locations);

    expect(rows).toEqual([]);
  });

  it('isolates reads and writes for two tenants', async () => {
    await withTenant(database, tenantA, async (transaction) => {
      await transaction.execute(sql`
        INSERT INTO locations (id, tenant_id, name)
        VALUES (${locationA}, ${tenantA}, 'Location A')
      `);
    });
    await withTenant(database, tenantB, async (transaction) => {
      await transaction.execute(sql`
        INSERT INTO locations (id, tenant_id, name)
        VALUES (${locationB}, ${tenantB}, 'Location B')
      `);
    });

    const rowsA = await withTenant(database, tenantA, (transaction) =>
      transaction.execute(sql`SELECT tenant_id FROM locations ORDER BY id`)
    );
    const rowsB = await withTenant(database, tenantB, (transaction) =>
      transaction.execute(sql`SELECT tenant_id FROM locations ORDER BY id`)
    );

    expect(rowsA).toEqual([{ tenant_id: tenantA }]);
    expect(rowsB).toEqual([{ tenant_id: tenantB }]);
  });

  it('does not leak context back to the pooled session', async () => {
    await withTenant(database, tenantA, () => Promise.resolve());

    const rows = await database.select().from(locations);
    expect(rows).toEqual([]);
  });
});
