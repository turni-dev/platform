import { z } from 'zod';

const bigintNonNegative = z.bigint().nonnegative();

export const spendUsageRecordSchema = z.strictObject({
  tenantId: z.uuidv7(),
  runId: z.uuid(),
  /** First day of the calendar month this spend belongs to, e.g. `2026-08-01`. */
  month: z.iso.date().regex(/-01$/),
  amountMicros: bigintNonNegative
});

export const spendTotalsSchema = z.strictObject({
  runSpentMicros: bigintNonNegative,
  monthSpentMicros: bigintNonNegative
});

export type SpendUsageRecord = z.infer<typeof spendUsageRecordSchema>;
export type SpendTotals = z.infer<typeof spendTotalsSchema>;

/**
 * Accumulates spend for two independent, concurrently-tracked periods per
 * tenant: the single agent run identified by `runId`, and the calendar
 * `month`. A single call records into both so callers never risk the two
 * counters drifting apart.
 */
export interface SpendUsageStorePort {
  recordSpend(input: SpendUsageRecord): Promise<SpendTotals>;
}
