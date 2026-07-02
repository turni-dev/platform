import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  actions,
  agentCoreTables,
  agents,
  bookings,
  idempotencyKeys
} from './schema.js';

describe('agent-core database schema', () => {
  it('owns agents, actions, bookings, and idempotency keys', () => {
    expect(agentCoreTables.map((table) => getTableConfig(table).name)).toEqual([
      'agents',
      'actions',
      'bookings',
      'idempotency_keys'
    ]);
  });

  it('enables tenant RLS for every table', () => {
    for (const table of agentCoreTables) {
      const config = getTableConfig(table);

      expect(config.enableRLS).toBe(true);
      expect(config.policies[0]?.name).toBe(
        `${config.name}_tenant_isolation`
      );
      expect(config.policies[0]?.to).toBe('app_rw');
    }
  });

  it('uses text checks for workflow statuses', () => {
    expect(getTableConfig(agents).checks.map((check) => check.name)).toContain(
      'agents_status_check'
    );
    expect(getTableConfig(actions).checks.map((check) => check.name)).toContain(
      'actions_status_check'
    );
    expect(getTableConfig(bookings).checks.map((check) => check.name)).toEqual(
      expect.arrayContaining(['bookings_party_size_check', 'bookings_status_check'])
    );
  });

  it('defines hot-path and anti-duplicate partial indexes', () => {
    const actionIndex = getTableConfig(actions).indexes.find(
      (index) => index.config.name === 'actions_pending_idx'
    );
    const bookingIndex = getTableConfig(bookings).indexes.find(
      (index) => index.config.name === 'bookings_active_slot_uidx'
    );

    expect(actionIndex?.config.where).toBeDefined();
    expect(bookingIndex?.config.unique).toBe(true);
    expect(bookingIndex?.config.where).toBeDefined();
  });

  it('uses the request key as the idempotency primary key', () => {
    const config = getTableConfig(idempotencyKeys);

    expect(config.columns.find((column) => column.name === 'key')?.primary).toBe(
      true
    );
    expect(config.columns.some((column) => column.name === 'id')).toBe(false);
  });
});
