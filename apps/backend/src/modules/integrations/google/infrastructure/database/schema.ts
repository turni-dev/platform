import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

const tenantSetting = sql`nullif(current_setting('app.tenant_id', true), '')::uuid`;

export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    providerSlug: text('provider_slug').notNull(),
    providerVersion: text('provider_version').default('1').notNull(),
    status: text('status').default('pending').notNull(),
    grantedScopes: text('granted_scopes').array().notNull(),
    credentialsEncrypted: text('credentials_enc'),
    providerAccountEmail: text('provider_account_email'),
    /** `{ "calendarId": "...", "spreadsheetId": "..." }` today; future
     * Google services (Gmail, Drive, ...) add new keys to this same jsonb
     * column instead of new dedicated columns, so no schema migration is
     * needed per new service. */
    resources: jsonb('resources')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    meta: jsonb('meta')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    check(
      'integration_connections_status_check',
      sql`${table.status} in ('pending', 'active', 'error', 'disabled')`
    ),
    index('integration_connections_tenant_provider_idx')
      .on(table.tenantId, table.providerSlug)
      .where(sql`${table.deletedAt} is null`),
    pgPolicy('integration_connections_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const integrationTables = [integrationConnections] as const;
