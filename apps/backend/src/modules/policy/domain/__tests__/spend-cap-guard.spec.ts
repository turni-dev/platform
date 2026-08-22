import { describe, expect, it } from 'vitest';

import { SpendCapGuard, type SpendCapLimits } from '../spend-cap-guard.js';
import type { SpendTotals } from '../../application/spend-usage-store.port.js';

const LIMITS: SpendCapLimits = Object.freeze({
  runLimitMicros: 100_000_000n,
  monthLimitMicros: 1_000_000_000n
});

function totals(runSpentMicros: bigint, monthSpentMicros: bigint): SpendTotals {
  return { runSpentMicros, monthSpentMicros };
}

describe('SpendCapGuard', () => {
  const guard = new SpendCapGuard();

  it('allows spend well below both caps', () => {
    const outcome = guard.evaluate(totals(1_000_000n, 10_000_000n), LIMITS);

    expect(outcome.verdict).toBe('allow');
    expect(outcome.periods).toEqual([
      { period: 'run', verdict: 'allow', spentMicros: 1_000_000n, limitMicros: 100_000_000n, ratio: 0.01 },
      { period: 'month', verdict: 'allow', spentMicros: 10_000_000n, limitMicros: 1_000_000_000n, ratio: 0.01 }
    ]);
  });

  it('warns once run spend crosses the 80% threshold', () => {
    const outcome = guard.evaluate(totals(80_000_000n, 10_000_000n), LIMITS);

    expect(outcome.verdict).toBe('warn');
    expect(outcome.periods[0]).toMatchObject({ period: 'run', verdict: 'warn' });
    expect(outcome.periods[1]).toMatchObject({ period: 'month', verdict: 'allow' });
  });

  it('warns once month spend crosses the 80% threshold', () => {
    const outcome = guard.evaluate(totals(1_000_000n, 800_000_000n), LIMITS);

    expect(outcome.verdict).toBe('warn');
    expect(outcome.periods[0]).toMatchObject({ period: 'run', verdict: 'allow' });
    expect(outcome.periods[1]).toMatchObject({ period: 'month', verdict: 'warn' });
  });

  it('denies once the run limit is exhausted regardless of month spend', () => {
    const outcome = guard.evaluate(totals(100_000_000n, 1_000n), LIMITS);

    expect(outcome.verdict).toBe('deny');
    expect(outcome.periods[0]).toMatchObject({ period: 'run', verdict: 'deny' });
    expect(outcome.periods[1]).toMatchObject({ period: 'month', verdict: 'allow' });
  });

  it('denies once the month limit is exhausted regardless of run spend', () => {
    const outcome = guard.evaluate(totals(1_000n, 1_000_000_000n), LIMITS);

    expect(outcome.verdict).toBe('deny');
    expect(outcome.periods[0]).toMatchObject({ period: 'run', verdict: 'allow' });
    expect(outcome.periods[1]).toMatchObject({ period: 'month', verdict: 'deny' });
  });

  it('deny wins over warn when both periods misbehave differently', () => {
    const outcome = guard.evaluate(totals(200_000_000n, 850_000_000n), LIMITS);

    expect(outcome.verdict).toBe('deny');
    expect(outcome.periods[0]).toMatchObject({ period: 'run', verdict: 'deny' });
    expect(outcome.periods[1]).toMatchObject({ period: 'month', verdict: 'warn' });
  });

  it('treats spend beyond the limit as deny, not a >100% warn', () => {
    const outcome = guard.evaluate(totals(500_000_000n, 10_000n), LIMITS);

    expect(outcome.verdict).toBe('deny');
    expect(outcome.periods[0]?.ratio).toBeGreaterThan(1);
  });

  it('is independent per period: neither cap leaks into the other ratio', () => {
    const outcome = guard.evaluate(totals(0n, 0n), LIMITS);

    expect(outcome.verdict).toBe('allow');
    expect(outcome.periods[0]?.ratio).toBe(0);
    expect(outcome.periods[1]?.ratio).toBe(0);
  });
});
