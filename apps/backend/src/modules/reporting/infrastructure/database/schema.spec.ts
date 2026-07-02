import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  events,
  paymentEvents,
  reportingTables,
  usageCounters
} from './schema.js';

describe('reporting database schema', () => {
  it('owns analytics and payment event tables', () => {
    expect(reportingTables.map((table) => getTableConfig(table).name)).toEqual([
      'events',
      'usage_counters',
      'payment_events'
    ]);
  });

  it('stores the standard event envelope with a partition-compatible key', () => {
    const config = getTableConfig(events);

    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'id',
        'tenant_id',
        'name',
        'version',
        'actor',
        'correlation_id',
        'props',
        'created_at'
      ])
    );
    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'id',
      'created_at'
    ]);
    expect(config.enableRLS).toBe(true);
  });

  it('isolates counters by tenant and uses their natural key', () => {
    const config = getTableConfig(usageCounters);

    expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
      'tenant_id',
      'period',
      'metric'
    ]);
    expect(config.enableRLS).toBe(true);
  });

  it('deduplicates global provider events outside tenant RLS', () => {
    const config = getTableConfig(paymentEvents);
    const eventIndex = config.indexes.find(
      (index) => index.config.name === 'payment_events_event_id_uidx'
    );

    expect(config.enableRLS).toBe(false);
    expect(eventIndex?.config.unique).toBe(true);
  });
});
