import { describe, expect, it } from 'vitest';

import { calculateSpendMicros, type SpendRates } from '../spend-cost-calculator.js';

const RATES: SpendRates = Object.freeze({
  inputPricePerThousandMicros: 200_000n,
  outputPricePerThousandMicros: 800_000n
});

describe('calculateSpendMicros', () => {
  it('prices billable input and output tokens per thousand', () => {
    const micros = calculateSpendMicros(
      { inputTokens: 1000, outputTokens: 1000, cachedTokens: 0 },
      RATES
    );

    expect(micros).toBe(1_000_000n);
  });

  it('excludes cached tokens from the billable input count', () => {
    const withoutCache = calculateSpendMicros(
      { inputTokens: 1000, outputTokens: 0, cachedTokens: 0 },
      RATES
    );
    const withCache = calculateSpendMicros(
      { inputTokens: 1000, outputTokens: 0, cachedTokens: 400 },
      RATES
    );

    expect(withCache).toBe((withoutCache * 600n) / 1000n);
  });

  it('never bills a negative amount when cachedTokens exceeds inputTokens', () => {
    const micros = calculateSpendMicros(
      { inputTokens: 100, outputTokens: 0, cachedTokens: 500 },
      RATES
    );

    expect(micros).toBe(0n);
  });

  it('rounds fractional micros down to the nearest whole micro', () => {
    const micros = calculateSpendMicros(
      { inputTokens: 1, outputTokens: 0, cachedTokens: 0 },
      { inputPricePerThousandMicros: 333n, outputPricePerThousandMicros: 0n }
    );

    // 1 * 333 / 1000 = 0.333, floored to 0.
    expect(micros).toBe(0n);
  });

  it('returns zero spend for zero usage', () => {
    expect(
      calculateSpendMicros({ inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, RATES)
    ).toBe(0n);
  });
});
