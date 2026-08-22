import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { automationTables, capabilityAutomationRequests, outboundTriggers } from './schema.js';

describe('automation database schema', () => {
  it('owns the outbound_triggers and capability_automation_requests tables', () => {
    expect(automationTables.map((table) => getTableConfig(table).name)).toEqual([
      'outbound_triggers',
      'capability_automation_requests'
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

describe('capability_automation_requests schema', () => {
  it('enables tenant RLS', () => {
    const config = getTableConfig(capabilityAutomationRequests);

    expect(config.enableRLS).toBe(true);
    expect(config.policies[0]?.name).toBe('capability_automation_requests_tenant_isolation');
    expect(config.policies[0]?.to).toBe('app_rw');
  });

  it('uses a text check for status and channel instead of enums', () => {
    expect(
      getTableConfig(capabilityAutomationRequests).checks.map((check) => check.name)
    ).toEqual(
      expect.arrayContaining([
        'capability_automation_requests_status_check',
        'capability_automation_requests_channel_check'
      ])
    );
  });

  it('deduplicates by tenant + idempotency key', () => {
    const config = getTableConfig(capabilityAutomationRequests);

    expect(config.uniqueConstraints.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining(['capability_automation_requests_idempotency_key_uidx'])
    );
  });
});
