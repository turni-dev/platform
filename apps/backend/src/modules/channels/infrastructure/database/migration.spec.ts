import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  './migrations/0003_channels.sql',
  import.meta.url
);

describe('channels migration', () => {
  it('creates the complete channels table slice', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(
      [...migration.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
        (match) => match[1]
      )
    ).toEqual([
      'channel_connections',
      'guests',
      'conversations',
      'messages',
      'webhook_inbox'
    ]);
  });

  it('forces RLS except on the pre-routing inbox', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    for (const table of [
      'channel_connections',
      'guests',
      'conversations',
      'messages'
    ]) {
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`
      );
    }

    expect(migration).not.toMatch(
      /ALTER TABLE webhook_inbox .*ROW LEVEL SECURITY/
    );
  });

  it('adds restrictive same-context and available cross-context keys', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    for (const reference of [
      'REFERENCES tenants(id) ON DELETE RESTRICT',
      'REFERENCES agents(id) ON DELETE RESTRICT',
      'REFERENCES guests(id) ON DELETE RESTRICT',
      'REFERENCES channel_connections(id) ON DELETE RESTRICT',
      'REFERENCES conversations(id) ON DELETE RESTRICT'
    ]) {
      expect(migration).toContain(reference);
    }
  });

  it('configures conversation HOT updates and application UUIDv7', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain(
      'ALTER TABLE conversations SET (fillfactor = 85)'
    );
    expect(migration).not.toMatch(/id uuid [^,\n]*DEFAULT/i);
  });
});
