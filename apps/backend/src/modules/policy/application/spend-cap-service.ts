import type { LlmUsage } from '@turni/llm';

import { calculateSpendMicros, type SpendRates } from '../domain/spend-cost-calculator.js';
import {
  type SpendCapGuard,
  type SpendCapLimits,
  type SpendCapOutcome
} from '../domain/spend-cap-guard.js';
import type { SpendUsageStorePort } from './spend-usage-store.port.js';

export interface RecordUsageInput {
  readonly tenantId: string;
  readonly runId: string;
  readonly occurredAt: Date;
  readonly usage: LlmUsage;
  readonly rates: SpendRates;
}

function monthPeriod(occurredAt: Date): string {
  const year = occurredAt.getUTCFullYear();
  const month = String(occurredAt.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Wires the dual-period spend cap end to end: prices the LLM call, records
 * it against both the single-run and calendar-month counters, then asks
 * {@link SpendCapGuard} whether the tenant may keep going. Callers block
 * further LLM/tool calls for the run (or the month) whenever the returned
 * outcome's `verdict` is `'deny'`; a `'warn'` verdict is logged/signalled
 * but does not stop execution.
 */
export class SpendCapService {
  public constructor(
    private readonly store: SpendUsageStorePort,
    private readonly guard: SpendCapGuard,
    private readonly limits: SpendCapLimits
  ) {}

  public async recordUsage(input: RecordUsageInput): Promise<SpendCapOutcome> {
    const amountMicros = calculateSpendMicros(input.usage, input.rates);

    const totals = await this.store.recordSpend({
      tenantId: input.tenantId,
      runId: input.runId,
      month: monthPeriod(input.occurredAt),
      amountMicros
    });

    return this.guard.evaluate(totals, this.limits);
  }
}
