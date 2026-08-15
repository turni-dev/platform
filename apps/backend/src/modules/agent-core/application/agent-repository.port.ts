import { AgentSummarySchema, AutomationAllowlistSchema } from '@turni/contracts';
import { z } from 'zod';

export const AgentRecordSchema = AgentSummarySchema.extend({
  tenantId: z.uuidv7(),
  automations: AutomationAllowlistSchema
});

export type AgentRecord = z.infer<typeof AgentRecordSchema>;

/** One agent per tenant in MVP; the table already supports more. */
export interface AgentRepositoryPort {
  findByTenant(tenantId: string): Promise<AgentRecord | undefined>;
  create(record: AgentRecord): Promise<void>;
  saveAutomations(
    input: Readonly<{ tenantId: string; agentId: string; presets: readonly string[] }>
  ): Promise<void>;
}

/** UUIDv7 everywhere; the generator is injected so tests stay deterministic. */
export interface AgentIdGeneratorPort {
  next(): string;
}
