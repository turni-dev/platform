import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common.js';
import { McpCapabilityIdSchema } from './mcp.js';

export const SkillSlugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);
export type SkillSlug = z.infer<typeof SkillSlugSchema>;

export const SkillPermissionScopeSchema = z
  .string()
  .regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/);
export type SkillPermissionScope = z.infer<typeof SkillPermissionScopeSchema>;

/** Validates "is a JSON object"; JSON Schema semantics are not checked here. */
export const JsonSchemaObjectSchema = z.record(z.string(), z.json());
export type JsonSchemaObject = z.infer<typeof JsonSchemaObjectSchema>;

export const SkillDefinitionSchema = z.strictObject({
  id: UuidSchema,
  slug: SkillSlugSchema,
  version: z.number().int().positive(),
  capabilityId: McpCapabilityIdSchema,
  inputSchema: JsonSchemaObjectSchema,
  outputSchema: JsonSchemaObjectSchema,
  permissions: z.array(SkillPermissionScopeSchema).max(20),
  active: z.boolean(),
  createdBy: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema
});
export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

/** The registry assigns `version` (next for the slug) and `active` (always
 * `false` for a new publish); callers never set either. */
export const SkillPublishInputSchema = z.strictObject({
  slug: SkillSlugSchema,
  capabilityId: McpCapabilityIdSchema,
  inputSchema: JsonSchemaObjectSchema,
  outputSchema: JsonSchemaObjectSchema,
  permissions: z.array(SkillPermissionScopeSchema).max(20),
  createdBy: UuidSchema.nullable()
});
export type SkillPublishInput = z.infer<typeof SkillPublishInputSchema>;

/** Definition and registry only: no `execute`. Invocation delegates to
 * `McpPort.invoke` in a later ticket. */
export interface SkillRegistryPort {
  publish(input: SkillPublishInput): Promise<SkillDefinition>;
  activate(slug: SkillSlug, version: number): Promise<SkillDefinition>;
  get(slug: SkillSlug, version: number): Promise<SkillDefinition | undefined>;
  list(slug: SkillSlug): Promise<readonly SkillDefinition[]>;
  resolveActive(slug: SkillSlug): Promise<SkillDefinition | undefined>;
}
