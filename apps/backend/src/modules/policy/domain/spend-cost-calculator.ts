import type { LlmUsage } from '@turni/llm';

/**
 * Prices already expressed in micros (1 currency unit = 1_000_000 micros)
 * per thousand tokens, so cost math stays in integers end to end.
 */
export interface SpendRates {
  readonly inputPricePerThousandMicros: bigint;
  readonly outputPricePerThousandMicros: bigint;
}

function billableAmount(tokens: number, pricePerThousandMicros: bigint): bigint {
  return (BigInt(Math.trunc(tokens)) * pricePerThousandMicros) / 1000n;
}

/**
 * Converts a single LLM call's usage into a spend amount in micros.
 * Cached input tokens are billed as free (typical provider cache discount),
 * so only the non-cached slice of `inputTokens` is priced; a usage report
 * where `cachedTokens` exceeds `inputTokens` never yields negative spend.
 */
export function calculateSpendMicros(usage: LlmUsage, rates: SpendRates): bigint {
  const billableInputTokens = Math.max(0, usage.inputTokens - usage.cachedTokens);

  return (
    billableAmount(billableInputTokens, rates.inputPricePerThousandMicros) +
    billableAmount(usage.outputTokens, rates.outputPricePerThousandMicros)
  );
}
