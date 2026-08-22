import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  withTenant,
  type TenantDatabase
} from '../../../../platform/database/with-tenant.js';
import {
  spendUsageRecordSchema,
  spendTotalsSchema,
  type SpendUsageRecord,
  type SpendUsageStorePort,
  type SpendTotals
} from '../../application/spend-usage-store.port.js';

const MONTH_SPEND_METRIC = 'llm_spend_micros';

const RunSpendRowSchema = z.array(z.strictObject({ spent_micros: z.coerce.bigint() }));
const MonthSpendRowSchema = z.array(z.strictObject({ value: z.coerce.bigint() }));

/**
 * Persists both halves of the dual-period spend cap inside one tenant
 * transaction: the per-run counter in its own table, and the per-month
 * counter in the platform-wide `usage_counters` table (metric
 * `llm_spend_micros`), so the two totals never observe partial writes.
 */
export class PostgresSpendUsageStore implements SpendUsageStorePort {
  public constructor(private readonly database: TenantDatabase) {}

  public async recordSpend(input: SpendUsageRecord): Promise<SpendTotals> {
    const record = spendUsageRecordSchema.parse(input);

    return withTenant(this.database, record.tenantId, async (transaction) => {
      const runRows = RunSpendRowSchema.parse(
        await transaction.execute(sql`
          INSERT INTO agent_run_spend (tenant_id, run_id, spent_micros)
          VALUES (${record.tenantId}, ${record.runId}, ${record.amountMicros})
          ON CONFLICT (tenant_id, run_id)
          DO UPDATE SET
            spent_micros = agent_run_spend.spent_micros + excluded.spent_micros,
            updated_at = now()
          RETURNING spent_micros
        `)
      );

      const monthRows = MonthSpendRowSchema.parse(
        await transaction.execute(sql`
          INSERT INTO usage_counters (tenant_id, period, metric, value)
          VALUES (${record.tenantId}, ${record.month}, ${MONTH_SPEND_METRIC}, ${record.amountMicros})
          ON CONFLICT (tenant_id, period, metric)
          DO UPDATE SET value = usage_counters.value + excluded.value
          RETURNING value
        `)
      );

      const runSpentMicros = runRows[0]?.spent_micros;
      const monthSpentMicros = monthRows[0]?.value;
      if (runSpentMicros === undefined || monthSpentMicros === undefined) {
        throw new Error('Spend cap upsert did not return the accumulated totals.');
      }

      return spendTotalsSchema.parse({ runSpentMicros, monthSpentMicros });
    });
  }
}
