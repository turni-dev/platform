import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const tenantSetting = sql`current_setting('app.tenant_id', true)::uuid`;
const id = () => uuid('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const agents = pgTable(
  'agents',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    template: text('template').default('dining').notNull(),
    status: text('status').default('draft').notNull(),
    autonomy: jsonb('autonomy')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'agents_status_check',
      sql`${table.status} in ('draft', 'training', 'active', 'paused')`
    ),
    uniqueIndex('agents_tenant_name_active_uidx')
      .on(table.tenantId, table.name)
      .where(sql`${table.deletedAt} is null`),
    index('agents_tenant_idx').on(table.tenantId),
    pgPolicy('agents_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const actions = pgTable(
  'actions',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    tool: text('tool').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').default('proposed').notNull(),
    undoDeadline: timestamp('undo_deadline', { withTimezone: true }),
    error: text('error'),
    createdBy: uuid('created_by'),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'actions_status_check',
      sql`${table.status} in (
        'proposed',
        'pending_approval',
        'executing',
        'done',
        'undone',
        'cancelled',
        'failed'
      )`
    ),
    index('actions_pending_idx')
      .on(table.tenantId)
      .where(
        sql`${table.status} in ('proposed', 'pending_approval', 'executing')`
      ),
    index('actions_conversation_idx').on(table.conversationId),
    pgPolicy('actions_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    locationId: uuid('location_id').notNull(),
    guestId: uuid('guest_id').notNull(),
    conversationId: uuid('conversation_id'),
    bookedAt: timestamp('at', { withTimezone: true }).notNull(),
    partySize: smallint('party_size').notNull(),
    status: text('status').default('requested').notNull(),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt()
  },
  (table) => [
    check('bookings_party_size_check', sql`${table.partySize} > 0`),
    check(
      'bookings_status_check',
      sql`${table.status} in (
        'requested',
        'confirmed',
        'seated',
        'no_show',
        'cancelled'
      )`
    ),
    uniqueIndex('bookings_active_slot_uidx')
      .on(table.tenantId, table.locationId, table.guestId, table.bookedAt)
      .where(sql`${table.status} not in ('cancelled', 'no_show')`),
    index('bookings_location_at_idx').on(
      table.tenantId,
      table.locationId,
      table.bookedAt
    ),
    pgPolicy('bookings_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    key: text('key').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').$type<Record<string, unknown>>(),
    statusCode: integer('status_code'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt()
  },
  (table) => [
    index('idempotency_keys_tenant_expires_idx').on(
      table.tenantId,
      table.expiresAt
    ),
    pgPolicy('idempotency_keys_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const agentCoreTables = [
  agents,
  actions,
  bookings,
  idempotencyKeys
] as const;
