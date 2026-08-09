import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Uint8Array }>({
  dataType: () => 'bytea'
});
const tenantSetting = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;
const id = () => uuid('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const channelConnections = pgTable(
  'channel_connections',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    type: text('type').notNull(),
    credentialsEncrypted: text('credentials_enc'),
    webhookSecret: text('webhook_secret'),
    allowedOrigins: text('allowed_origins').array(),
    status: text('status').default('pending').notNull(),
    metadata: jsonb('meta')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'channel_connections_type_check',
      sql`${table.type} in ('telegram', 'widget')`
    ),
    check(
      'channel_connections_status_check',
      sql`${table.status} in ('pending', 'active', 'error', 'disabled')`
    ),
    uniqueIndex('channel_connections_bot_active_uidx')
      .on(
        table.tenantId,
        table.type,
        sql`(${table.metadata} ->> 'bot_username')`
      )
      .where(sql`${table.deletedAt} is null`),
    index('channel_connections_agent_idx').on(table.agentId),
    pgPolicy('channel_connections_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const guests = pgTable(
  'guests',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    phoneHash: bytea('phone_hash'),
    phoneEncrypted: text('phone_enc'),
    phoneMasked: text('phone_masked'),
    name: text('name'),
    metadata: jsonb('meta')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    firstSeenAt: timestamp('first_seen_at', {
      withTimezone: true
    })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('guests_tenant_phone_uidx').on(
      table.tenantId,
      table.phoneHash
    ),
    index('guests_tenant_last_seen_idx').on(
      table.tenantId,
      table.lastSeenAt
    ),
    pgPolicy('guests_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const guestSessions = pgTable(
  'guest_sessions',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => channelConnections.id, { onDelete: 'restrict' }),
    guestId: uuid('guest_id').references(() => guests.id, {
      onDelete: 'restrict'
    }),
    tokenHash: bytea('token_hash').notNull(),
    tokenKid: text('token_kid').notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('guest_sessions_token_hash_uidx').on(table.tokenHash),
    index('guest_sessions_tenant_expires_idx').on(table.tenantId, table.expiresAt),
    pgPolicy('guest_sessions_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const conversations = pgTable(
  'conversations',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    guestId: uuid('guest_id').references(() => guests.id, {
      onDelete: 'restrict'
    }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => channelConnections.id, { onDelete: 'restrict' }),
    status: text('status').default('active').notNull(),
    lastMessageAt: timestamp('last_msg_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    unreadCountForOwner: integer('unread_count_for_owner').default(0).notNull(),
    nextSequence: bigint('next_seq', { mode: 'bigint' })
      .default(0n)
      .notNull(),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'conversations_status_check',
      sql`${table.status} in ('active', 'handed_off', 'closed')`
    ),
    check(
      'conversations_unread_count_check',
      sql`${table.unreadCountForOwner} >= 0`
    ),
    index('conversations_tenant_last_msg_idx').on(
      table.tenantId,
      table.lastMessageAt.desc()
    ),
    pgPolicy('conversations_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const messages = pgTable(
  'messages',
  {
    id: id(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'restrict' }),
    tenantId: uuid('tenant_id').notNull(),
    sequence: bigint('seq', { mode: 'bigint' }).notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    contentTokens: integer('content_tokens'),
    verdict: jsonb('verdict').$type<Record<string, unknown>>(),
    latencyMs: integer('latency_ms'),
    promptReference: text('prompt_ref'),
    modelId: text('model_id'),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'messages_role_check',
      sql`${table.role} in ('guest', 'agent', 'owner', 'system')`
    ),
    uniqueIndex('messages_conversation_seq_uidx').on(
      table.conversationId,
      table.sequence
    ),
    index('messages_tenant_created_idx').on(
      table.tenantId,
      table.createdAt
    ),
    pgPolicy('messages_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const webhookInbox = pgTable(
  'webhook_inbox',
  {
    id: id(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').default('received').notNull(),
    error: text('error'),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'webhook_inbox_source_check',
      sql`${table.source} in ('telegram', 'yookassa')`
    ),
    check(
      'webhook_inbox_status_check',
      sql`${table.status} in ('received', 'processed', 'failed')`
    ),
    uniqueIndex('webhook_inbox_source_external_uidx').on(
      table.source,
      table.externalId
    )
  ]
);

export const channelTables = [
  channelConnections,
  guests,
  guestSessions,
  conversations,
  messages,
  webhookInbox
] as const;
