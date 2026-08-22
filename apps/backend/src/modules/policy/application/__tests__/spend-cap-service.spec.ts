import { describe, expect, it } from 'vitest';

import { FakeSpendUsageStore } from '../fake-spend-usage-store.js';
import { SpendCapService } from '../spend-cap-service.js';
import { SpendCapGuard } from '../../domain/spend-cap-guard.js';

const TENANT_ID = '018f0000-0000-7000-8000-000000000001';
const RUN_ID = '018f0000-0000-7000-8000-000000000002';
const OCCURRED_AT = new Date('2026-08-22T10:00:00.000Z');

const RATES = Object.freeze({
  inputPricePerThousandMicros: 200_000n,
  outputPricePerThousandMicros: 800_000n
});

function service(limits: { runLimitMicros: bigint; monthLimitMicros: bigint }, store = new FakeSpendUsageStore()) {
  return { service: new SpendCapService(store, new SpendCapGuard(), limits), store };
}

describe('SpendCapService', () => {
  it('prices usage, records it under the run and the calendar month, and allows small spend', async () => {
    const { service: svc, store } = service({
      runLimitMicros: 1_000_000_000n,
      monthLimitMicros: 10_000_000_000n
    });

    const outcome = await svc.recordUsage({
      tenantId: TENANT_ID,
      runId: RUN_ID,
      occurredAt: OCCURRED_AT,
      usage: { inputTokens: 1000, outputTokens: 1000, cachedTokens: 0 },
      rates: RATES
    });

    expect(outcome.verdict).toBe('allow');
    expect(store.calls).toEqual([
      {
        tenantId: TENANT_ID,
        runId: RUN_ID,
        month: '2026-08-01',
        amountMicros: 1_000_000n
      }
    ]);
  });

  it('denies further calls once the run limit is exhausted, without touching the month cap', async () => {
    const { service: svc } = service({
      runLimitMicros: 1_500_000n,
      monthLimitMicros: 10_000_000_000n
    });

    const first = await svc.recordUsage({
      tenantId: TENANT_ID,
      runId: RUN_ID,
      occurredAt: OCCURRED_AT,
      usage: { inputTokens: 1000, outputTokens: 1000, cachedTokens: 0 },
      rates: RATES
    });
    expect(first.verdict).toBe('allow');

    const second = await svc.recordUsage({
      tenantId: TENANT_ID,
      runId: RUN_ID,
      occurredAt: OCCURRED_AT,
      usage: { inputTokens: 1000, outputTokens: 1000, cachedTokens: 0 },
      rates: RATES
    });

    expect(second.verdict).toBe('deny');
    expect(second.periods.find((period) => period.period === 'run')?.verdict).toBe('deny');
  });

  it('accumulates spend across different runs into the same calendar month', async () => {
    const store = new FakeSpendUsageStore();
    const { service: svc } = service(
      { runLimitMicros: 10_000_000_000n, monthLimitMicros: 1_800_000n },
      store
    );
    const otherRunId = '018f0000-0000-7000-8000-000000000003';

    await svc.recordUsage({
      tenantId: TENANT_ID,
      runId: RUN_ID,
      occurredAt: OCCURRED_AT,
      usage: { inputTokens: 1000, outputTokens: 1000, cachedTokens: 0 },
      rates: RATES
    });

    const outcome = await svc.recordUsage({
      tenantId: TENANT_ID,
      runId: otherRunId,
      occurredAt: OCCURRED_AT,
      usage: { inputTokens: 1000, outputTokens: 1000, cachedTokens: 0 },
      rates: RATES
    });

    expect(outcome.verdict).toBe('deny');
    expect(outcome.periods.find((period) => period.period === 'month')?.spentMicros).toBe(2_000_000n);
    expect(outcome.periods.find((period) => period.period === 'run')?.spentMicros).toBe(1_000_000n);
  });
});
