import { z } from 'zod';
import { CurrencyCodeSchema, DecimalMoneySchema } from '@turni/contracts';

export const ToolCallCostSchema = z.strictObject({
  amount: DecimalMoneySchema,
  currency: CurrencyCodeSchema
});

export type ToolCallCost = z.infer<typeof ToolCallCostSchema>;

/**
 * A run's running cost starts at zero in whatever currency its first call
 * was priced in.
 */
export function zeroCost(currency: string): ToolCallCost {
  return ToolCallCostSchema.parse({ amount: '0.00', currency });
}

/**
 * Adds two tool-call costs as integer cents so repeated additions across a
 * long-running agent turn never drift the way float addition would.
 */
export function addCost(left: ToolCallCost, right: ToolCallCost): ToolCallCost {
  const parsedLeft = ToolCallCostSchema.parse(left);
  const parsedRight = ToolCallCostSchema.parse(right);

  if (parsedLeft.currency !== parsedRight.currency) {
    throw new Error(
      `Cannot add tool-call costs in different currencies: ${parsedLeft.currency} vs ${parsedRight.currency}`
    );
  }

  const sumCents = toCents(parsedLeft.amount) + toCents(parsedRight.amount);
  return ToolCallCostSchema.parse({ amount: fromCents(sumCents), currency: parsedLeft.currency });
}

function toCents(amount: string): number {
  const [whole = '0', fraction = '00'] = amount.split('.');
  return Number(whole) * 100 + Number(fraction);
}

function fromCents(cents: number): string {
  const wholePart = Math.floor(cents / 100);
  const fractionPart = String(cents % 100).padStart(2, '0');
  return `${wholePart}.${fractionPart}`;
}
