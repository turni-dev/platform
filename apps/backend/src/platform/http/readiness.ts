import { sql } from 'drizzle-orm';
import type { TenantDatabase } from '../database/with-tenant.js';

export interface ReadinessPort {
  /** Resolves when the dependency is reachable; rejects otherwise. */
  ping(): Promise<void>;
}

/**
 * Readiness for the primary Postgres connection pool. Deliberately runs
 * outside `withTenant` — readiness has no tenant, it only proves the pool
 * can open a transaction and round-trip a trivial query.
 */
export class DatabaseReadinessCheck implements ReadinessPort {
  public constructor(private readonly database: TenantDatabase) {}

  public async ping(): Promise<void> {
    await this.database.transaction((transaction) => transaction.execute(sql`SELECT 1`));
  }
}
