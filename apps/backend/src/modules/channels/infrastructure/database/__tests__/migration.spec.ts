import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const channelsMigrationUrl = new URL('../migrations/0003_channels.sql', import.meta.url);
const guestSessionsMigrationUrl = new URL(
  '../migrations/0015_guest_sessions.sql',
  import.meta.url
);
const vkChannelMigrationUrl = new URL('../migrations/0017_vk_channel.sql', import.meta.url);
const channelRefMigrationUrl = new URL(
  '../migrations/0018_guest_channel_ref.concurrent.sql',
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

describe('vk channel migration', () => {
  it('widens both checks without holding a long lock', async () => {
    const migration = await readFile(vkChannelMigrationUrl, 'utf8');

    expect(migration).toContain('DROP CONSTRAINT channel_connections_type_check');
    expect(migration).toContain("type IN ('telegram', 'widget', 'vk')");
    expect(migration).toContain('DROP CONSTRAINT webhook_inbox_source_check');
    expect(migration).toContain("source IN ('telegram', 'yookassa', 'vk')");
    expect(migration).toContain('NOT VALID');
    expect(migration).toContain('VALIDATE CONSTRAINT');
  });

  it('indexes the guest channel reference concurrently and channel-agnostically', async () => {
    const migration = await readFile(channelRefMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE UNIQUE INDEX CONCURRENTLY');
    expect(migration).toContain('guests_tenant_channel_ref_uidx');
    expect(migration).toContain("(meta ->> 'channel_ref')");
    expect(migration).not.toContain('vk_user_id');
  });
});
