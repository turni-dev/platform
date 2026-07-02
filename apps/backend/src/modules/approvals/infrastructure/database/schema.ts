import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  numeric,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uuid
} from 'drizzle-orm/pg-core';

type ApprovalCard = Readonly<{
  conversationExcerpt: string;
  [key: string]: unknown;
}>;

type RagSource = Readonly<{
  file: string;
  excerpt: string;
  score: number;
}>;

const tenantSetting = sql`current_setting('app.tenant_id', true)::uuid`;

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actionId: uuid('action_id'),
    messageId: uuid('message_id'),
    reason: text('reason').notNull(),
    policyRuleId: text('policy_rule_id'),
    confidence: numeric('confidence', { precision: 3, scale: 2 }),
    card: jsonb('card').$type<ApprovalCard>().notNull(),
    ragSources: jsonb('rag_sources').$type<readonly RagSource[]>(),
    slaDeadline: timestamp('sla_deadline', { withTimezone: true }),
    decision: text('decision'),
    editedPayload: jsonb('edited_payload').$type<Record<string, unknown>>(),
    editDiff: text('edit_diff'),
    createdBy: uuid('created_by'),
    decidedBy: uuid('decided_by'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  (table) => [
    check(
      'approvals_single_subject_check',
      sql`num_nonnulls(${table.actionId}, ${table.messageId}) = 1`
    ),
    check(
      'approvals_reason_check',
      sql`${table.reason} in (
        'refund', 'complaint', 'banquet', 'allergen_miss',
        'out_of_kb', 'low_confidence', 'policy_rule'
      )`
    ),
    check(
      'approvals_confidence_check',
      sql`${table.confidence} is null or ${table.confidence} between 0 and 1`
    ),
    check(
      'approvals_decision_check',
      sql`${table.decision} is null or ${table.decision} in (
        'approved', 'edited', 'rejected', 'expired'
      )`
    ),
    index('approvals_pending_idx')
      .on(table.tenantId, table.slaDeadline)
      .where(sql`${table.decision} is null`),
    pgPolicy('approvals_tenant_isolation', {
      for: 'all',
      to: 'app_rw',
      using: sql`${table.tenantId} = ${tenantSetting}`,
      withCheck: sql`${table.tenantId} = ${tenantSetting}`
    })
  ]
).enableRLS();

export const approvalTables = [approvals] as const;
