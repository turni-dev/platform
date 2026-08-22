import { z } from 'zod';
import { IsoDateTimeSchema, JsonValueSchema } from '@turni/contracts';
import { ToolCallCostSchema } from './tool-call-cost.js';

export const ToolCallOutcomeSchema = z.enum(['success', 'error']);
export type ToolCallOutcome = z.infer<typeof ToolCallOutcomeSchema>;

/**
 * One record per tool call inside an agent run, shaped for future mining of
 * repeated call chains: `sequence` doubles as the accumulated call count for
 * the run (it is the ordinal position of this call, so "call #3" already
 * means "3 calls so far"), `params` are redacted before this schema ever
 * sees them, and `correlationId` threads every trace in a run together.
 */
export const ToolCallTraceSchema = z.strictObject({
  id: z.uuidv7(),
  tenantId: z.uuidv7(),
  correlationId: z.uuidv7(),
  sequence: z.number().int().positive(),
  toolName: z.string().min(1).max(200),
  params: z.record(z.string(), JsonValueSchema),
  outcome: ToolCallOutcomeSchema,
  errorMessage: z.string().max(2000).optional(),
  cost: ToolCallCostSchema,
  cumulativeCost: ToolCallCostSchema,
  occurredAt: IsoDateTimeSchema
});

export type ToolCallTrace = z.infer<typeof ToolCallTraceSchema>;
