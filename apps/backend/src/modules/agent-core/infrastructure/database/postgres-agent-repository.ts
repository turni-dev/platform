import { AgentStatusSchema, AutomationAllowlistSchema } from '@turni/contracts';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTenant, type TenantDatabase } from '../../../../platform/database/with-tenant.js';
import {
  AgentRecordSchema,
  type AgentRecord,
  type AgentRepositoryPort
} from '../../application/agent-repository.port.js';

/** postgres-js returns `jsonb` as a parsed object or as text depending on the
 * query shape, so the row schema accepts both and always yields the allowlist. */
const allowlistColumn = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .transform((value) => (typeof value === 'string' ? (JSON.parse(value) as unknown) : value))
  .pipe(AutomationAllowlistSchema);

const AgentRowSchema = z.object({
  id: z.uuidv7(),
  name: z.string(),
  template: z.string(),
  status: AgentStatusSchema,
  autonomy: allowlistColumn
});

export class PostgresAgentRepository implements AgentRepositoryPort {
  public constructor(private readonly database: TenantDatabase) {}

  public async findByTenant(tenantId: string): Promise<AgentRecord | undefined> {
    const tenant = z.uuidv7().parse(tenantId);

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(AgentRowSchema).parse(
        await transaction.execute(sql`
          SELECT id, name, template, status, autonomy
          FROM agents
          WHERE tenant_id = ${tenant} AND deleted_at IS NULL
          ORDER BY created_at
          LIMIT 1
        `)
      );
      const row = rows[0];

      return row === undefined
        ? undefined
        : AgentRecordSchema.parse({
            agentId: row.id,
            tenantId: tenant,
            name: row.name,
            template: row.template,
            status: row.status,
            automations: row.autonomy
          });
    });
  }

  public async create(record: AgentRecord): Promise<void> {
    const agent = AgentRecordSchema.parse(record);

    await withTenant(this.database, agent.tenantId, (transaction) =>
      transaction
        .execute(sql`
          INSERT INTO agents (id, tenant_id, name, template, status, autonomy)
          VALUES (
            ${agent.agentId}, ${agent.tenantId}, ${agent.name}, ${agent.template},
            ${agent.status}, ${JSON.stringify(agent.automations)}::jsonb
          )
        `)
        .then(() => undefined)
    );
  }

  public async saveAutomations(
    input: Readonly<{ tenantId: string; agentId: string; presets: readonly string[] }>
  ): Promise<void> {
    const request = z
      .strictObject({
        tenantId: z.uuidv7(),
        agentId: z.uuidv7(),
        presets: z.array(z.string())
      })
      .parse(input);
    const allowlist = AutomationAllowlistSchema.parse({ presets: request.presets });

    await withTenant(this.database, request.tenantId, (transaction) =>
      transaction
        .execute(sql`
          UPDATE agents
          SET autonomy = ${JSON.stringify(allowlist)}::jsonb
          WHERE tenant_id = ${request.tenantId}
            AND id = ${request.agentId}
            AND deleted_at IS NULL
        `)
        .then(() => undefined)
    );
  }
}
