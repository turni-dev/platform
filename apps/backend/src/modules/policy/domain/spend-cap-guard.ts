import type { SpendTotals } from '../application/spend-usage-store.port.js';

/**
 * Two independent accident modes, two independent caps:
 * a single agent run can burn through tokens in seconds, while a tenant's
 * calendar month can accumulate low-severity overspend across many runs.
 * A single shared counter catches neither, so `run` and `month` are always
 * evaluated separately and combined with DENY taking precedence.
 */
export type SpendCapVerdict = 'allow' | 'warn' | 'deny';
export type SpendCapPeriod = 'run' | 'month';

export interface SpendCapLimits {
  readonly runLimitMicros: bigint;
  readonly monthLimitMicros: bigint;
}

export interface SpendCapPeriodStatus {
  readonly period: SpendCapPeriod;
  readonly verdict: SpendCapVerdict;
  readonly spentMicros: bigint;
  readonly limitMicros: bigint;
  readonly ratio: number;
}

export interface SpendCapOutcome {
  readonly verdict: SpendCapVerdict;
  readonly periods: readonly [SpendCapPeriodStatus, SpendCapPeriodStatus];
}

const WARN_THRESHOLD_RATIO = 0.8;

const VERDICT_PRIORITY: Readonly<Record<SpendCapVerdict, number>> = Object.freeze({
  deny: 2,
  warn: 1,
  allow: 0
});

function ratioOf(spentMicros: bigint, limitMicros: bigint): number {
  if (limitMicros <= 0n) {
    return spentMicros > 0n ? Number.POSITIVE_INFINITY : 0;
  }
  return Number(spentMicros) / Number(limitMicros);
}

function verdictOf(spentMicros: bigint, limitMicros: bigint, ratio: number): SpendCapVerdict {
  if (spentMicros >= limitMicros) {
    return 'deny';
  }
  return ratio >= WARN_THRESHOLD_RATIO ? 'warn' : 'allow';
}

function evaluatePeriod(
  period: SpendCapPeriod,
  spentMicros: bigint,
  limitMicros: bigint
): SpendCapPeriodStatus {
  const ratio = ratioOf(spentMicros, limitMicros);
  return Object.freeze({
    period,
    verdict: verdictOf(spentMicros, limitMicros, ratio),
    spentMicros,
    limitMicros,
    ratio
  });
}

export class SpendCapGuard {
  public evaluate(totals: SpendTotals, limits: SpendCapLimits): SpendCapOutcome {
    const run = evaluatePeriod('run', totals.runSpentMicros, limits.runLimitMicros);
    const month = evaluatePeriod('month', totals.monthSpentMicros, limits.monthLimitMicros);
    const verdict =
      VERDICT_PRIORITY[run.verdict] >= VERDICT_PRIORITY[month.verdict] ? run.verdict : month.verdict;

    return Object.freeze({ verdict, periods: [run, month] as const });
  }
}
