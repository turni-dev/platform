import type { LlmUsage } from '@turni/llm';
import { ToolCallCostSchema, type ToolCallCost } from './tool-call-cost.js';

interface TokenRate {
  readonly inputPerThousand: number;
  readonly outputPerThousand: number;
}

/**
 * No project-wide LLM spend calculator exists yet (checked
 * `apps/backend/src/modules/policy/domain/spend-cost-calculator.ts` — not
 * present in main). This table is intentionally narrow: it only prices
 * tool-call traces, in RUB, for models this backend actually calls. Replace
 * it with the shared calculator if/when one lands.
 */
const MODEL_RATES: Readonly<Record<string, TokenRate>> = {
  'yandexgpt/latest': { inputPerThousand: 0.2, outputPerThousand: 0.6 },
  'yandexgpt-lite/latest': { inputPerThousand: 0.1, outputPerThousand: 0.3 }
};

const DEFAULT_RATE: TokenRate = { inputPerThousand: 0.2, outputPerThousand: 0.6 };

export function costFromLlmUsage(
  usage: LlmUsage,
  model: string,
  currency = 'RUB'
): ToolCallCost {
  const rate = MODEL_RATES[model] ?? DEFAULT_RATE;
  const billableInputTokens = Math.max(usage.inputTokens - usage.cachedTokens, 0);
  const amount =
    (billableInputTokens / 1000) * rate.inputPerThousand +
    (usage.outputTokens / 1000) * rate.outputPerThousand;

  return ToolCallCostSchema.parse({ amount: amount.toFixed(2), currency });
}
