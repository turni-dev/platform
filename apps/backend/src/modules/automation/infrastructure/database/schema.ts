import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

const tenantSetting = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

export const outboundTriggers = pgTable(
  'outbound_triggers',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    status: text('status').default('active').notNull(),
    consecutiveFailures: integer('consecutive_failures').default(0).notNull(),
    failureThreshold: integer('failure_threshold').default(3).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check(
      'outbound_triggers_status_check',
      sql`${table.status} in ('active', 'disabled')`
    ),
    check(
      'outbound_triggers_failure_threshold_check',
      sql`${table.failureThreshold} > 0`
    ),
    check(
      'outbound_triggers_consecutive_failures_check',
      sql`${table.consecutiveFailures} >= 0`
    ),
    pgPolicy('outbound_triggers_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const automationTables = [outboundTriggers] as const;
