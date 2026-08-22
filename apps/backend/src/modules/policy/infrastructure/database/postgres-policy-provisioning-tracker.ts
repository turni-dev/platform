import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { withTenant, type TenantDatabase } from '../../../../platform/database/with-tenant.js';
import {
  policyRowIdentitySchema,
  type PolicyProvisioningStatus,
  type PolicyProvisioningTrackerPort,
  type PolicyRowIdentity
} from '../../application/policy-provisioning.port.js';

const StatusRowSchema = z.object({
  defaults_version: z.string(),
  defaults_fingerprint: z.string()
});

/** Persists provisioning status into `policy_provisioning`
 * (migration `0025_policy_provisioning.sql`). One row per (tenant, agent);
 * `recordStatus` upserts so re-provisioning after a defaults change simply
 * overwrites the tracked dimension. */
export class PostgresPolicyProvisioningTracker implements PolicyProvisioningTrackerPort {
  public constructor(private readonly database: TenantDatabase) {}

  public async getStatus(identity: PolicyRowIdentity): Promise<PolicyProvisioningStatus | undefined> {
    const { tenantId, agentId } = policyRowIdentitySchema.parse(identity);

    return withTenant(this.database, tenantId, async (transaction) => {
      const rows = z.array(StatusRowSchema).parse(
        await transaction.execute(sql`
          SELECT defaults_version, defaults_fingerprint
          FROM policy_provisioning
          WHERE tenant_id = ${tenantId} AND agent_id = ${agentId}
        `)
      );
      const row = rows[0];

      return row === undefined
        ? undefined
        : { version: row.defaults_version, fingerprint: row.defaults_fingerprint };
    });
  }

  public async recordStatus(identity: PolicyRowIdentity, status: PolicyProvisioningStatus): Promise<void> {
    const { tenantId, agentId } = policyRowIdentitySchema.parse(identity);

    await withTenant(this.database, tenantId, (transaction) =>
      transaction
        .execute(sql`
          INSERT INTO policy_provisioning (tenant_id, agent_id, defaults_version, defaults_fingerprint)
          VALUES (${tenantId}, ${agentId}, ${status.version}, ${status.fingerprint})
          ON CONFLICT (tenant_id, agent_id) DO UPDATE SET
            defaults_version = EXCLUDED.defaults_version,
            defaults_fingerprint = EXCLUDED.defaults_fingerprint,
            updated_at = now()
        `)
        .then(() => undefined)
    );
  }
}
