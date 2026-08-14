import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

const tenantIdSchema = z.uuid();
const tenantContextRowsSchema = z.array(
  z.object({ tenant_id: z.string().nullable() })
);

export interface TenantTransaction {
  execute(query: SQL): Promise<unknown>;
}

export interface TenantDatabase {
  transaction<T>(
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T>;
}

/**
 * Sets and verifies the tenant context of an already open transaction. Use it
 * only where the transaction must start before its tenant exists, such as
 * bootstrap registration; every other caller uses {@link withTenant}.
 */
export async function enterTenantContext(
  transaction: TenantTransaction,
  tenantId: string
): Promise<string> {
  const validTenantId = tenantIdSchema.parse(tenantId);

  await transaction.execute(
    sql`SELECT set_config('app.tenant_id', ${validTenantId}, true)`
  );
  const result = await transaction.execute(
    sql`SELECT current_setting('app.tenant_id', true) AS tenant_id`
  );
  const contextTenantId = tenantContextRowsSchema.parse(result)[0]?.tenant_id;

  if (contextTenantId !== validTenantId) {
    throw new Error('Tenant context assertion failed');
  }

  return validTenantId;
}

export async function withTenant<T>(
  database: TenantDatabase,
  tenantId: string,
  operation: (transaction: TenantTransaction) => Promise<T>
): Promise<T> {
  const validTenantId = tenantIdSchema.parse(tenantId);

  return database.transaction(async (transaction) => {
    await enterTenantContext(transaction, validTenantId);

    return operation(transaction);
  });
}
