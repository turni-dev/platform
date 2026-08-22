import {
  spendUsageRecordSchema,
  type SpendUsageRecord,
  type SpendUsageStorePort,
  type SpendTotals
} from './spend-usage-store.port.js';

/**
 * In-memory double for {@link SpendUsageStorePort}, used by tests and local
 * development. Mirrors the Postgres adapter's accumulation semantics: each
 * `(tenantId, runId)` and each `(tenantId, month)` pair keeps its own
 * running total.
 */
export class FakeSpendUsageStore implements SpendUsageStorePort {
  public readonly calls: SpendUsageRecord[] = [];

  private readonly runTotals = new Map<string, bigint>();
  private readonly monthTotals = new Map<string, bigint>();

  public recordSpend(input: SpendUsageRecord): Promise<SpendTotals> {
    const record = spendUsageRecordSchema.parse(input);
    this.calls.push(record);

    const runKey = `${record.tenantId}:${record.runId}`;
    const monthKey = `${record.tenantId}:${record.month}`;

    const runSpentMicros = (this.runTotals.get(runKey) ?? 0n) + record.amountMicros;
    const monthSpentMicros = (this.monthTotals.get(monthKey) ?? 0n) + record.amountMicros;

    this.runTotals.set(runKey, runSpentMicros);
    this.monthTotals.set(monthKey, monthSpentMicros);

    return Promise.resolve({ runSpentMicros, monthSpentMicros });
  }
}
