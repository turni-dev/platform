import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { approvalTables, approvals } from './schema.js';

describe('approvals database schema', () => {
  it('owns the approval inbox table', () => {
    expect(approvalTables.map((table) => getTableConfig(table).name)).toEqual([
      'approvals'
    ]);
  });

  it('stores exactly one approval subject', () => {
    const config = getTableConfig(approvals);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['action_id', 'message_id', 'created_by'])
    );
    expect(config.checks.map((check) => check.name)).toContain(
      'approvals_single_subject_check'
    );
  });

  it('uses checked text vocabularies and bounded confidence', () => {
    const checks = getTableConfig(approvals).checks.map((check) => check.name);

    expect(checks).toEqual([
      'approvals_single_subject_check',
      'approvals_reason_check',
      'approvals_confidence_check',
      'approvals_decision_check'
    ]);
  });

  it('forces tenant RLS and indexes the pending inbox', () => {
    const config = getTableConfig(approvals);
    const pendingIndex = config.indexes.find(
      (index) => index.config.name === 'approvals_pending_idx'
    );

    expect(config.enableRLS).toBe(true);
    expect(config.policies.map((policy) => policy.name)).toEqual([
      'approvals_tenant_isolation'
    ]);
    expect(pendingIndex?.config.where).toBeDefined();
  });
});
