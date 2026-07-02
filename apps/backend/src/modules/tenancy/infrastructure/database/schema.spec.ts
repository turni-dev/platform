import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  authCodes,
  locations,
  sessions,
  tenancyTables,
  tenants,
  users
} from './schema.js';

describe('tenancy database schema', () => {
  it('owns the complete first tenancy slice', () => {
    expect(tenancyTables.map((table) => getTableConfig(table).name)).toEqual([
      'tenants',
      'locations',
      'users',
      'sessions',
      'auth_codes'
    ]);
  });

  it('enables fail-closed RLS on tenant-scoped tables only', () => {
    for (const table of [locations, users, sessions]) {
      const config = getTableConfig(table);

      expect(config.enableRLS).toBe(true);
      expect(config.policies.map((policy) => policy.name)).toEqual([
        `${config.name}_tenant_isolation`
      ]);
      expect(config.policies[0]?.to).toBe('app_rw');
    }

    expect(getTableConfig(tenants).enableRLS).toBe(false);
    expect(getTableConfig(authCodes).enableRLS).toBe(false);
  });

  it('uses citext and partial uniqueness for active user emails', () => {
    const config = getTableConfig(users);
    const email = config.columns.find((column) => column.name === 'email');
    const activeEmailIndex = config.indexes.find(
      (index) => index.config.name === 'users_tenant_email_active_uidx'
    );

    expect(email?.getSQLType()).toBe('citext');
    expect(activeEmailIndex?.config.unique).toBe(true);
    expect(activeEmailIndex?.config.where).toBeDefined();
  });

  it('uses a boolean for automatic seating confirmation', () => {
    const setting = getTableConfig(locations).columns.find(
      (column) => column.name === 'auto_confirm_seating'
    );

    expect(setting?.getSQLType()).toBe('boolean');
  });

  it('uses restrictive foreign keys for tenant business data', () => {
    const foreignKeys = [locations, users, sessions].flatMap(
      (table) => getTableConfig(table).foreignKeys
    );

    expect(
      foreignKeys.map((foreignKey) => ({
        foreignTable: getTableConfig(foreignKey.reference().foreignTable).name,
        onDelete: foreignKey.onDelete
      }))
    ).toEqual([
      { foreignTable: 'tenants', onDelete: 'restrict' },
      { foreignTable: 'tenants', onDelete: 'restrict' },
      { foreignTable: 'tenants', onDelete: 'restrict' },
      { foreignTable: 'users', onDelete: 'restrict' }
    ]);
  });

  it('keeps UUIDv7 generation in the application', () => {
    for (const table of tenancyTables) {
      const id = getTableConfig(table).columns.find(
        (column) => column.name === 'id'
      );

      expect(id?.hasDefault).toBe(false);
    }
  });
});
