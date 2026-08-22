import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { withTenant, type TenantDatabase } from '../../../../platform/database/with-tenant.js';
import {
  policyRowIdentitySchema,
  type PolicyRow,
  type PolicyRowIdentity,
  type PolicyWriterPort
} from '../../application/policy-provisioning.port.js';
import { PolicyTargetSchema, type CompiledSelectorPolicy } from '../../domain/policy-rule-selector.js';
import { UuidV7Generator, type UuidV7GeneratorPort } from '../uuid-v7-generator.js';

const CompiledSelectorPolicySchema = z.strictObject({
  ruleId: z.string(),
  target: PolicyTargetSchema,
  verdict: z.enum(['auto', 'approval', 'escalate_human', 'out_of_kb', 'refuse']),
  riskScore: z.number().int(),
  approvalRequired: z.boolean(),
  allowlist: z.array(z.string()).optional(),
  budgetLimit: z.number().int().optional()
});

const PolicyRowSchema = z.object({
  path: z.string(),
  layer: z.enum(['locked', 'workspace', 'agent', 'user']),
  compiled: CompiledSelectorPolicySchema
});

/** `exactOptionalPropertyTypes` treats an optional key (`allowlist?: T`) as
 * distinct from a required key typed `T | undefined`; the domain's
 * `CompiledSelectorPolicy` uses the latter (matching `PolicyLayerRule`), so
 * a value freshly parsed by `CompiledSelectorPolicySchema` (which uses the
 * former, since jsonb omits an absent key rather than storing `null`) needs
 * this explicit projection before it can flow through `PolicyRow`. */
function toCompiledSelectorPolicy(
  parsed: z.infer<typeof CompiledSelectorPolicySchema>
): CompiledSelectorPolicy {
  return {
    ruleId: parsed.ruleId,
    target: parsed.target,
    verdict: parsed.verdict,
    riskScore: parsed.riskScore,
    approvalRequired: parsed.approvalRequired,
    allowlist: parsed.allowlist,
    budgetLimit: parsed.budgetLimit
  };
}

/** Persists selector-compiled policy rows into the shared `policies` table
 * (see `infrastructure/database/schema.ts`). Only ever inserts -- an
 * existing `(agent_id, path)` row is left untouched, matching
 * `PolicyProvisioningService`'s "never overwrite" contract; a real
 * update/narrowing write path (out of this card's scope) would go through
 * `domain/policy-rule-write.ts` before issuing its own `UPDATE`. */
export class PostgresPolicyWriter implements PolicyWriterPort {
  public constructor(
    private readonly database: TenantDatabase,
    private readonly ids: UuidV7GeneratorPort = new UuidV7Generator()
  ) {}

  public async findByPath(identity: PolicyRowIdentity, path: string): Promise<PolicyRow | undefined> {
    const { tenantId, agentId } = policyRowIdentitySchema.parse(identity);

    return withTenant(this.database, tenantId, async (transaction) => {
      const rows = z.array(PolicyRowSchema).parse(
        await transaction.execute(sql`
          SELECT path, layer, compiled
          FROM policies
          WHERE tenant_id = ${tenantId} AND agent_id = ${agentId} AND path = ${path}
        `)
      );
      const row = rows[0];

      return row === undefined
        ? undefined
        : { path: row.path, layer: row.layer, compiled: toCompiledSelectorPolicy(row.compiled) };
    });
  }

  public async insertIfAbsent(identity: PolicyRowIdentity, row: PolicyRow): Promise<boolean> {
    const { tenantId, agentId } = policyRowIdentitySchema.parse(identity);
    const validRow = PolicyRowSchema.parse(row);
    const id = this.ids.next();

    return withTenant(this.database, tenantId, async (transaction) => {
      const inserted = z.array(z.strictObject({ path: z.string() })).parse(
        await transaction.execute(sql`
          INSERT INTO policies (id, tenant_id, agent_id, path, layer, compiled)
          VALUES (
            ${id}, ${tenantId}, ${agentId}, ${validRow.path}, ${validRow.layer},
            ${JSON.stringify(validRow.compiled)}::jsonb
          )
          ON CONFLICT (agent_id, path) DO NOTHING
          RETURNING path
        `)
      );

      return inserted.length > 0;
    });
  }
}
