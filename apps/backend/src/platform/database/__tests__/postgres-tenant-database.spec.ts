import { describe, expect, it } from 'vitest';
import type { TenantTransaction } from '../with-tenant.js';
import { createPostgresTenantDatabase } from '../postgres-tenant-database.js';

describe('createPostgresTenantDatabase', () => {
  it('rejects an invalid DATABASE_URL before it creates a PostgreSQL client', () => {
    let clientFactoryCalls = 0;

    expect(() =>
      createPostgresTenantDatabase({
        databaseUrl: 'not-a-database-url',
        clientFactory: () => {
          clientFactoryCalls += 1;
          throw new Error('must not create a client');
        }
      })
    ).toThrow();

    expect(clientFactoryCalls).toBe(0);
  });

  it('exposes a tenant database backed by an injected client and closes it', async () => {
    const transaction: TenantTransaction = {
      execute: () => Promise.resolve([])
    };
    let ended = false;
    const database = createPostgresTenantDatabase({
      databaseUrl: 'postgresql://user:password@localhost:5432/turni',
      clientFactory: () => ({
        end: () => {
          ended = true;
          return Promise.resolve();
        }
      }),
      databaseFactory: () => ({
        transaction: <T>(operation: (value: TenantTransaction) => Promise<T>) =>
          operation(transaction)
      })
    });

    await expect(
      database.database.transaction(() => Promise.resolve('done'))
    ).resolves.toBe('done');
    await database.close();

    expect(ended).toBe(true);
  });
});
