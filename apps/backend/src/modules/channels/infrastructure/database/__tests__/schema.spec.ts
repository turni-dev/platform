import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  channelConnections,
  channelTables,
  conversations,
  guests,
  guestSessions,
  messages,
  webhookInbox
} from '../schema.js';

describe('channels database schema', () => {
  it('owns channel connections, guests, guest sessions, dialogs, messages, and inbox', () => {
    expect(channelTables.map((table) => getTableConfig(table).name)).toEqual([
      'channel_connections',
      'guests',
      'guest_sessions',
      'conversations',
      'messages',
      'webhook_inbox'
    ]);
  });

  it('enables tenant RLS except on the pre-routing webhook inbox', () => {
    for (const table of [
      channelConnections,
      guests,
      guestSessions,
      conversations,
      messages
    ]) {
      const config = getTableConfig(table);

      expect(config.enableRLS).toBe(true);
      expect(config.policies[0]?.name).toBe(
        `${config.name}_tenant_isolation`
      );
    }

    expect(getTableConfig(webhookInbox).enableRLS).toBe(false);
  });

  it('stores signed-routing scope and lifecycle data without raw tokens', () => {
    const columns = getTableConfig(guestSessions).columns;
    const agentId = columns.find((column) => column.name === 'agent_id');
    const tokenHash = columns.find((column) => column.name === 'token_hash');
    const tokenKid = columns.find((column) => column.name === 'token_kid');
    const issuedAt = columns.find((column) => column.name === 'issued_at');
    const expiresAt = columns.find((column) => column.name === 'expires_at');
    const revokedAt = columns.find((column) => column.name === 'revoked_at');
    const lastUsedAt = columns.find((column) => column.name === 'last_used_at');
    const id = columns.find((column) => column.name === 'id');
    const uniqueTokenHash = getTableConfig(guestSessions).indexes.find(
      (index) => index.config.name === 'guest_sessions_token_hash_uidx'
    );

    expect(agentId?.notNull).toBe(true);
    expect(tokenHash?.getSQLType()).toBe('bytea');
    expect(tokenKid?.notNull).toBe(true);
    expect(issuedAt?.notNull).toBe(true);
    expect(expiresAt?.getSQLType()).toBe('timestamp with time zone');
    expect(revokedAt?.notNull).toBe(false);
    expect(lastUsedAt?.notNull).toBe(false);
    expect(id?.hasDefault).toBe(false);
    expect(uniqueTokenHash?.config.unique).toBe(true);
    expect(columns.map((column) => column.name)).not.toContain('token');
  });

  it('uses restrictive same-context foreign keys', () => {
    const foreignKeys = [guestSessions, conversations, messages].flatMap(
      (table) => getTableConfig(table).foreignKeys
    );

    expect(
      foreignKeys.map((foreignKey) => ({
        foreignTable: getTableConfig(foreignKey.reference().foreignTable).name,
        onDelete: foreignKey.onDelete
      }))
    ).toEqual([
      { foreignTable: 'channel_connections', onDelete: 'restrict' },
      { foreignTable: 'guests', onDelete: 'restrict' },
      { foreignTable: 'guests', onDelete: 'restrict' },
      { foreignTable: 'channel_connections', onDelete: 'restrict' },
      { foreignTable: 'conversations', onDelete: 'restrict' }
    ]);
  });
});
