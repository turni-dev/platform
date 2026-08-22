import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
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

/**
 * One personal-automation request per detected booking intent, gated on
 * explicit owner approval before any Calendar/Sheets write. See
 * `application/capability-automation-service.ts` for the guarded state
 * machine this table backs: every transition method the repository exposes
 * is an `UPDATE ... WHERE status = '<expected>'`, so a retried approval or a
 * redelivered job can only ever win a transition once.
 */
export const capabilityAutomationRequests = pgTable(
  'capability_automation_requests',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    connectionId: uuid('connection_id').notNull(),
    channel: text('channel').notNull(),
    guestRef: text('guest_ref').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').default('pending_approval').notNull(),
    calendarSummary: text('calendar_summary').notNull(),
    calendarStartsAt: timestamp('calendar_starts_at', { withTimezone: true }).notNull(),
    calendarEndsAt: timestamp('calendar_ends_at', { withTimezone: true }).notNull(),
    calendarEventId: text('calendar_event_id'),
    sheetsAppended: boolean('sheets_appended').default(false).notNull(),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    unique('capability_automation_requests_idempotency_key_uidx').on(
      table.tenantId,
      table.idempotencyKey
    ),
    check('capability_automation_requests_channel_check', sql`${table.channel} in ('vk')`),
    check(
      'capability_automation_requests_status_check',
      sql`${table.status} in (
        'pending_approval', 'approved', 'rejected', 'executing', 'executed', 'failed'
      )`
    ),
    pgPolicy('capability_automation_requests_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const automationTables = [outboundTriggers, capabilityAutomationRequests] as const;
