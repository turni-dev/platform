import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from 'drizzle-orm/pg-core';

const tenantSetting = sql`current_setting('app.tenant_id', true)::uuid`;
const id = () => uuid('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const policies = pgTable(
  'policies',
  {
    id: id(),
    tenantId: uuid('tenant_id').notNull(),
    agentId: uuid('agent_id').notNull(),
    path: text('path').notNull(),
    layer: text('layer').notNull(),
    compiled: jsonb('compiled').$type<Record<string, unknown>>().notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    updatedBy: uuid('updated_by'),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'policies_layer_check',
      sql`${table.layer} in ('locked', 'custom')`
    ),
    uniqueIndex('policies_agent_path_uidx').on(table.agentId, table.path),
    index('policies_tenant_agent_idx').on(table.tenantId, table.agentId),
    pgPolicy('policies_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    }),
    pgPolicy('policies_locked_update', {
      as: 'restrictive',
      for: 'update',
      to: 'app_rw',
      using: sql`${table.layer} <> 'locked'`,
      withCheck: sql`${table.layer} <> 'locked'`
    }),
    pgPolicy('policies_locked_delete', {
      as: 'restrictive',
      for: 'delete',
      to: 'app_rw',
      using: sql`${table.layer} <> 'locked'`
    })
  ]
).enableRLS();

export const prompts = pgTable(
  'prompts',
  {
    id: id(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    modelHints: jsonb('model_hints')
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    active: boolean('active').default(false).notNull(),
    createdBy: uuid('created_by'),
    createdAt: createdAt()
  },
  (table) => [
    check('prompts_version_check', sql`${table.version} > 0`),
    uniqueIndex('prompts_key_version_uidx').on(table.key, table.version),
    uniqueIndex('prompts_key_active_uidx')
      .on(table.key)
      .where(sql`${table.active} = true`)
  ]
);

export const modelConfigs = pgTable(
  'model_configs',
  {
    id: id(),
    role: text('role').notNull(),
    tier: text('tier').notNull(),
    modelId: text('model_id').notNull(),
    inputPrice: numeric('price_in', { precision: 8, scale: 4 }),
    outputPrice: numeric('price_out', { precision: 8, scale: 4 }),
    active: boolean('active').default(true).notNull(),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'model_configs_role_check',
      sql`${table.role} in (
        'classify', 'generate', 'summarize', 'judge', 'embed'
      )`
    ),
    check(
      'model_configs_tier_check',
      sql`${table.tier} in ('cheap', 'main', 'premium')`
    ),
    uniqueIndex('model_configs_role_tier_model_uidx').on(
      table.role,
      table.tier,
      table.modelId
    )
  ]
);

export const evalCases = pgTable(
  'eval_cases',
  {
    id: id(),
    vertical: text('vertical').notNull(),
    input: text('input').notNull(),
    history: jsonb('history')
      .$type<readonly Record<string, unknown>[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    golden: text('golden'),
    riskLabel: text('risk_label').notNull(),
    mustRefuse: boolean('must_refuse').default(false).notNull(),
    source: text('source').notNull(),
    createdAt: createdAt()
  },
  (table) => [
    check(
      'eval_cases_risk_label_check',
      sql`${table.riskLabel} in ('safe', 'risky', 'blocked')`
    ),
    check(
      'eval_cases_source_check',
      sql`${table.source} in ('manual', 'edited', 'synthetic')`
    ),
    index('eval_cases_vertical_risk_idx').on(
      table.vertical,
      table.riskLabel
    )
  ]
);

export const policyTables = [
  policies,
  prompts,
  modelConfigs,
  evalCases
] as const;
