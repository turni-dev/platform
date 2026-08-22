import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { automationTables, outboundTriggers } from './schema.js';

describe('automation database schema', () => {
  it('owns the outbound_triggers table', () => {
    expect(automationTables.map((table) => getTableConfig(table).name)).toEqual([
      'outbound_triggers'
    ]);
  });

  it('enables tenant RLS', () => {
    const config = getTableConfig(outboundTriggers);

    expect(config.enableRLS).toBe(true);
    expect(config.policies[0]?.name).toBe('outbound_triggers_tenant_isolation');
    expect(config.policies[0]?.to).toBe('app_rw');
  });

  it('uses a text check for status instead of an enum', () => {
    expect(
      getTableConfig(outboundTriggers).checks.map((check) => check.name)
    ).toEqual(
      expect.arrayContaining([
        'outbound_triggers_status_check',
        'outbound_triggers_failure_threshold_check',
        'outbound_triggers_consecutive_failures_check'
      ])
    );
  });

  it('defines the primary key as a uuid id column, not a composite key', () => {
    const config = getTableConfig(outboundTriggers);

    expect(config.columns.find((column) => column.name === 'id')?.primary).toBe(true);
  });
});
