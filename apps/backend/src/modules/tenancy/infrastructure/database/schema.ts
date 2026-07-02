import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  index,
  inet,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({
  dataType: () => 'citext'
});
const bytea = customType<{ data: Uint8Array }>({
  dataType: () => 'bytea'
});
const tenantSetting = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;
const id = () => uuid('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    name: text('name').notNull(),
    plan: text('plan').default('trial').notNull(),
    status: text('status').default('active').notNull(),
    settings: jsonb('settings')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: createdAt()
  },
  (table) => [
    check('tenants_plan_check', sql`${table.plan} in ('trial', 'start', 'pro')`),
    check(
      'tenants_status_check',
      sql`${table.status} in ('active', 'paused', 'deleted')`
    )
  ]
);

export const locations = pgTable(
  'locations',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    timezone: text('tz').default('Europe/Moscow').notNull(),
    address: text('address'),
    capacity: smallint('capacity'),
    autoConfirmSeating: boolean('auto_confirm_seating')
      .default(false)
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'locations_capacity_check',
      sql`${table.capacity} is null or ${table.capacity} > 0`
    ),
    index('locations_tenant_idx').on(table.tenantId),
    pgPolicy('locations_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    role: text('role').notNull(),
    email: citext('email').notNull(),
    telegramChatId: bigint('tg_chat_id', { mode: 'bigint' }),
    notificationPreferences: jsonb('notify_prefs')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check('users_role_check', sql`${table.role} in ('owner', 'staff')`),
    uniqueIndex('users_tenant_email_active_uidx')
      .on(table.tenantId, table.email)
      .where(sql`${table.deletedAt} is null`),
    index('users_tenant_idx').on(table.tenantId),
    pgPolicy('users_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    tokenHash: bytea('token_hash').notNull().unique(),
    ipAddress: inet('ip'),
    userAgent: text('ua'),
    idleExpiresAt: timestamp('idle_expires_at', {
      withTimezone: true
    }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', {
      withTimezone: true
    }).notNull(),
    createdAt: createdAt()
  },
  (table) => [
    index('sessions_user_idx').on(table.userId),
    index('sessions_tenant_idx').on(table.tenantId),
    pgPolicy('sessions_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const authCodes = pgTable(
  'auth_codes',
  {
    id: id(),
    email: citext('email').notNull(),
    codeHash: text('code_hash').notNull(),
    attempts: smallint('attempts').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'auth_codes_attempts_check',
      sql`${table.attempts} between 0 and 5`
    ),
    index('auth_codes_email_expires_idx').on(table.email, table.expiresAt)
  ]
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    plan: text('plan').notNull(),
    status: text('status').notNull(),
    currentPeriodStart: timestamp('current_period_start', {
      withTimezone: true
    }),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true
    }),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'subscriptions_plan_check',
      sql`${table.plan} in ('trial', 'start', 'pro')`
    ),
    check(
      'subscriptions_status_check',
      sql`${table.status} in (
        'trialing', 'active', 'past_due', 'paused', 'cancelled'
      )`
    ),
    index('subscriptions_tenant_idx').on(table.tenantId),
    pgPolicy('subscriptions_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
    currency: char('currency', { length: 3 }).default('RUB').notNull(),
    status: text('status').default('draft').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt()
  },
  (table) => [
    check('invoices_amount_check', sql`${table.amount} >= 0`),
    check(
      'invoices_status_check',
      sql`${table.status} in ('draft', 'sent', 'paid', 'void')`
    ),
    index('invoices_tenant_status_idx').on(table.tenantId, table.status),
    pgPolicy('invoices_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const tenancyTables = [
  tenants,
  locations,
  users,
  sessions,
  authCodes,
  subscriptions,
  invoices
] as const;
