import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

type EventActor = Readonly<{
  type: 'guest' | 'owner' | 'agent' | 'system';
  id?: string;
}>;

const tenantSetting = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const events = pgTable(
  'events',
  {
    id: uuid('id').notNull(),
    tenantId: uuid('tenant_id'),
    name: text('name').notNull(),
    version: smallint('version').default(1).notNull(),
    actor: jsonb('actor').$type<EventActor>().notNull(),
    correlationId: uuid('correlation_id').notNull(),
    props: jsonb('props').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt()
  },
  (table) => [
    primaryKey({ columns: [table.id, table.createdAt] }),
    check('events_version_check', sql`${table.version} > 0`),
    index('events_tenant_name_created_idx').on(
      table.tenantId,
      table.name,
      table.createdAt
    ),
    pgPolicy('events_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const usageCounters = pgTable(
  'usage_counters',
  {
    tenantId: uuid('tenant_id').notNull(),
    period: date('period').notNull(),
    metric: text('metric').notNull(),
    value: bigint('value', { mode: 'bigint' }).default(0n).notNull(),
    createdAt: createdAt()
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.period, table.metric] }),
    check('usage_counters_value_check', sql`${table.value} >= 0`),
    pgPolicy('usage_counters_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey(),
    provider: text('provider').notNull(),
    eventId: text('event_id').notNull(),
    paymentId: text('payment_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    uniqueIndex('payment_events_event_id_uidx').on(table.eventId),
    index('payment_events_payment_id_idx').on(table.paymentId)
  ]
);

export const reportingTables = [
  events,
  usageCounters,
  paymentEvents
] as const;
