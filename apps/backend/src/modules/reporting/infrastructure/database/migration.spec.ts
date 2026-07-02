import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  './migrations/0010_reporting.sql',
  import.meta.url
);

describe('reporting migration', () => {
  it('creates all reporting tables', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(
      [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
        (match) => match[1]
      )
    ).toEqual([
      'events',
      'events_default',
      'usage_counters',
      'payment_events'
    ]);
  });

  it('partitions events from day one and provides a default partition', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('PARTITION BY RANGE (created_at)');
    expect(migration).toContain(
      'CREATE TABLE events_default PARTITION OF events DEFAULT'
    );
    expect(migration).toContain('PRIMARY KEY (id, created_at)');
  });

  it('makes tenant events isolated and append-only for app_rw', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('ALTER TABLE events FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY events_tenant_isolation');
    expect(migration).toContain('CREATE TRIGGER events_no_update');
    expect(migration).toContain('CREATE TRIGGER events_no_delete');
    expect(migration).toContain('GRANT SELECT, INSERT ON events TO app_rw');
    expect(migration).toContain(
      'REVOKE UPDATE, DELETE ON events FROM app_rw'
    );
  });

  it('isolates usage counters and deduplicates provider events', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'ALTER TABLE usage_counters FORCE ROW LEVEL SECURITY'
    );
    expect(migration).toContain(
      'PRIMARY KEY (tenant_id, period, metric)'
    );
    expect(migration).toContain('event_id text NOT NULL UNIQUE');
  });

  it('keeps UUIDv7 generation in the application', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).not.toMatch(/id uuid [^,\n]*DEFAULT/i);
    expect(migration).not.toMatch(/gen_random_uuid|uuid_generate/i);
  });
});
