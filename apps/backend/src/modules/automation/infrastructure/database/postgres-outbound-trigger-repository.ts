import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTenant, type TenantDatabase } from '../../../../platform/database/with-tenant.js';
import type { OutboundTrigger } from '../../domain/outbound-trigger.js';
import type { OutboundTriggerRepositoryPort } from '../../application/outbound-trigger-repository.port.js';

const OutboundTriggerRowSchema = z.object({
  id: z.uuidv7(),
  tenant_id: z.uuidv7(),
  status: z.enum(['active', 'disabled']),
  consecutive_failures: z.number().int(),
  failure_threshold: z.number().int()
});

function toDomain(row: z.output<typeof OutboundTriggerRowSchema>): OutboundTrigger {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    status: row.status,
    consecutiveFailures: row.consecutive_failures,
    failureThreshold: row.failure_threshold
  };
}

export class PostgresOutboundTriggerRepository implements OutboundTriggerRepositoryPort {
  public constructor(private readonly database: TenantDatabase) {}

  public async findById(tenantId: string, id: string): Promise<OutboundTrigger | undefined> {
    const tenant = z.uuidv7().parse(tenantId);
    const triggerId = z.uuidv7().parse(id);

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(OutboundTriggerRowSchema).parse(
        await transaction.execute(sql`
          SELECT id, tenant_id, status, consecutive_failures, failure_threshold
          FROM outbound_triggers
          WHERE tenant_id = ${tenant} AND id = ${triggerId}
        `)
      );
      const row = rows[0];

      return row === undefined ? undefined : toDomain(row);
    });
  }

  public async save(trigger: OutboundTrigger): Promise<void> {
    const tenant = z.uuidv7().parse(trigger.tenantId);

    await withTenant(this.database, tenant, (transaction) =>
      transaction
        .execute(sql`
          INSERT INTO outbound_triggers (
            id, tenant_id, status, consecutive_failures, failure_threshold
          ) VALUES (
            ${trigger.id}, ${tenant}, ${trigger.status},
            ${trigger.consecutiveFailures}, ${trigger.failureThreshold}
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            consecutive_failures = EXCLUDED.consecutive_failures,
            failure_threshold = EXCLUDED.failure_threshold,
            updated_at = now()
        `)
        .then(() => undefined)
    );
  }
}
