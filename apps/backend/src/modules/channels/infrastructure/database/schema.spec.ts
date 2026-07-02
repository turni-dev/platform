import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  channelConnections,
  channelTables,
  conversations,
  guests,
  messages,
  webhookInbox
} from './schema.js';

describe('channels database schema', () => {
  it('owns channel connections, guests, dialogs, messages, and inbox', () => {
    expect(channelTables.map((table) => getTableConfig(table).name)).toEqual([
      'channel_connections',
      'guests',
      'conversations',
      'messages',
      'webhook_inbox'
    ]);
  });

  it('enables tenant RLS except on the pre-routing webhook inbox', () => {
    for (const table of [
      channelConnections,
      guests,
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

  it('keeps conversation sequence allocation in PostgreSQL', () => {
    const nextSequence = getTableConfig(conversations).columns.find(
      (column) => column.name === 'next_seq'
    );
    const messageSequence = getTableConfig(messages).columns.find(
      (column) => column.name === 'seq'
    );

    expect(nextSequence?.getSQLType()).toBe('bigint');
    expect(nextSequence?.hasDefault).toBe(true);
    expect(messageSequence?.getSQLType()).toBe('bigint');
  });

  it('defines channel and message uniqueness rules', () => {
    const connectionIndex = getTableConfig(channelConnections).indexes.find(
      (index) => index.config.name === 'channel_connections_bot_active_uidx'
    );
    const messageIndex = getTableConfig(messages).indexes.find(
      (index) => index.config.name === 'messages_conversation_seq_uidx'
    );

    expect(connectionIndex?.config.unique).toBe(true);
    expect(connectionIndex?.config.where).toBeDefined();
    expect(messageIndex?.config.unique).toBe(true);
  });

  it('uses restrictive same-context foreign keys', () => {
    const foreignKeys = [conversations, messages].flatMap(
      (table) => getTableConfig(table).foreignKeys
    );

    expect(
      foreignKeys.map((foreignKey) => ({
        foreignTable: getTableConfig(foreignKey.reference().foreignTable).name,
        onDelete: foreignKey.onDelete
      }))
    ).toEqual([
      { foreignTable: 'guests', onDelete: 'restrict' },
      { foreignTable: 'channel_connections', onDelete: 'restrict' },
      { foreignTable: 'conversations', onDelete: 'restrict' }
    ]);
  });
});
