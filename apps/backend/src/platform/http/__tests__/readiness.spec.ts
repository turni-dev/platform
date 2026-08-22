import { describe, expect, it } from 'vitest';
import type { TenantDatabase, TenantTransaction } from '../../database/with-tenant.js';
import { DatabaseReadinessCheck } from '../readiness.js';

function fakeDatabase(behavior: 'ok' | 'unreachable'): TenantDatabase {
  return {
    transaction: async <T>(operation: (transaction: TenantTransaction) => Promise<T>): Promise<T> => {
      if (behavior === 'unreachable') {
        throw new Error('connection refused');
      }

      return operation({ execute: () => Promise.resolve([{ '?column?': 1 }]) });
    }
  };
}

describe('DatabaseReadinessCheck', () => {
  it('resolves when the database round-trips a query', async () => {
    const check = new DatabaseReadinessCheck(fakeDatabase('ok'));

    await expect(check.ping()).resolves.toBeUndefined();
  });

  it('rejects when the database is unreachable', async () => {
    const check = new DatabaseReadinessCheck(fakeDatabase('unreachable'));

    await expect(check.ping()).rejects.toThrow('connection refused');
  });
});
