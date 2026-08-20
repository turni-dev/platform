import { z } from 'zod';

export const McpOperationSchema = z.enum(['read', 'write']);

export type McpOperation = z.infer<typeof McpOperationSchema>;

export const McpCapabilityIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/);

export type McpCapabilityId = z.infer<typeof McpCapabilityIdSchema>;

export const McpProviderSlugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

export type McpProviderSlug = z.infer<typeof McpProviderSlugSchema>;

export const McpCapabilitySchema = z.strictObject({
  id: McpCapabilityIdSchema,
  providerSlug: McpProviderSlugSchema,
  operation: McpOperationSchema
});

export type McpCapability = z.infer<typeof McpCapabilitySchema>;

export const McpDiscoveryInputSchema = z.strictObject({
  tenantId: z.uuidv7(),
  agentId: z.uuidv7()
});

export type McpDiscoveryInput = z.infer<typeof McpDiscoveryInputSchema>;

export const McpInvocationSchema = z.strictObject({
  connectionId: z.uuidv7(),
  capabilityId: McpCapabilityIdSchema,
  input: z.json()
});

export type McpInvocation = z.infer<typeof McpInvocationSchema>;

export const McpInvocationResultSchema = z.strictObject({
  output: z.json()
});

export type McpInvocationResult = z.infer<typeof McpInvocationResultSchema>;

/** The only integration capability boundary consumed by agent runtime and
 * automation. Providers validate their own named capability payloads before
 * a vendor adapter is reached. */
export interface McpPort {
  discover(input: McpDiscoveryInput): Promise<readonly McpCapability[]>;
  invoke(input: McpInvocation): Promise<McpInvocationResult>;
}
