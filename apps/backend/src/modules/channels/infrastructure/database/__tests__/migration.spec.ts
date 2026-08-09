import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const channelsMigrationUrl = new URL('../migrations/0003_channels.sql', import.meta.url);
const guestSessionsMigrationUrl = new URL(
  '../migrations/0015_guest_sessions.sql',
  import.meta.url
);

describe('channels migration', () => {
  it('creates the complete channels table slice', async () => {
    const migration = await readFile(channelsMigrationUrl, 'utf8');

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

  it('creates RLS-isolated guest sessions with only a token hash', async () => {
    const migration = await readFile(guestSessionsMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE guest_sessions');
    expect(migration).toContain('id uuid PRIMARY KEY');
    expect(migration).toContain('agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE RESTRICT');
    expect(migration).toContain('connection_id uuid NOT NULL');
    expect(migration).toContain('REFERENCES channel_connections(id) ON DELETE RESTRICT');
    expect(migration).toContain('guest_id uuid REFERENCES guests(id) ON DELETE RESTRICT');
    expect(migration).toContain('token_hash bytea NOT NULL');
    expect(migration).toContain('token_kid text NOT NULL');
    expect(migration).toContain('issued_at timestamptz NOT NULL');
    expect(migration).toContain('expires_at timestamptz NOT NULL');
    expect(migration).toContain('revoked_at timestamptz');
    expect(migration).toContain('last_used_at timestamptz');
    expect(migration).toContain('ALTER TABLE guest_sessions FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('CREATE POLICY guest_sessions_tenant_isolation');
    expect(migration).not.toContain('token text');
  });
});
