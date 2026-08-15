import { z } from 'zod';
import { UuidSchema } from '../common.js';

/**
 * Who the business is and how it speaks. One file, always in context, always
 * editable by the owner.
 */
export const AgentInstructionsPath = 'identity.md' as const;

/** The one folder the cabinet may write into. `policies/` stays out of reach:
 * the policy engine must never be rewritable as free text. */
export const KnowledgeFolder = 'knowledge/' as const;

const maxFileContentLength = 20_000;

export const KnowledgeFilePathSchema = z
  .string()
  .max(200)
  .regex(
    /^knowledge\/[a-z0-9][a-z0-9-]*\.md$/,
    'Knowledge paths are lowercase markdown files directly inside knowledge/'
  );

export const AgentStatusSchema = z.enum(['draft', 'training', 'active', 'paused']);

export const AgentSummarySchema = z.strictObject({
  agentId: UuidSchema,
  name: z.string().trim().min(1).max(200),
  template: z.string().trim().min(1).max(64),
  status: AgentStatusSchema
});

export const AgentFileSchema = z.strictObject({
  path: z.string().min(1).max(200),
  revision: z.number().int().positive(),
  content: z.string().max(maxFileContentLength)
});

export const AgentFileSummarySchema = z.strictObject({
  path: KnowledgeFilePathSchema,
  revision: z.number().int().positive()
});

/** Default deny: an empty allowlist means the agent may run no automation. */
export const AutomationAllowlistSchema = z.strictObject({
  presets: z.array(z.string().trim().min(1).max(64)).max(50).default([])
});

export const AgentConfigurationSchema = z.strictObject({
  agent: AgentSummarySchema,
  instructions: AgentFileSchema,
  knowledge: z.array(AgentFileSummarySchema).max(200),
  automations: AutomationAllowlistSchema
});

export const AgentInstructionsUpdateSchema = z.strictObject({
  content: z.string().max(maxFileContentLength)
});

export const KnowledgeFileUpsertSchema = z.strictObject({
  path: KnowledgeFilePathSchema,
  content: z.string().max(maxFileContentLength)
});

export const AutomationAllowlistUpdateSchema = AutomationAllowlistSchema;

export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type AgentSummary = z.infer<typeof AgentSummarySchema>;
export type AgentFile = z.infer<typeof AgentFileSchema>;
export type AgentFileSummary = z.infer<typeof AgentFileSummarySchema>;
export type AutomationAllowlist = z.infer<typeof AutomationAllowlistSchema>;
export type AgentConfiguration = z.infer<typeof AgentConfigurationSchema>;
export type AgentInstructionsUpdate = z.infer<typeof AgentInstructionsUpdateSchema>;
export type KnowledgeFileUpsert = z.infer<typeof KnowledgeFileUpsertSchema>;
