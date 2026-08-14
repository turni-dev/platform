import { sql } from 'drizzle-orm';
import { OwnerRole } from '@turni/contracts';
import {
  enterTenantContext,
  type TenantDatabase
} from '../../../../platform/database/with-tenant.js';
import {
  OwnerRegistrationSchema,
  type OwnerRegistration,
  type OwnerRegistrationRepositoryPort
} from '../../application/owner-registration-repository.port.js';

export class PostgresOwnerRegistrationRepository
  implements OwnerRegistrationRepositoryPort
{
  public constructor(private readonly database: TenantDatabase) {}

  public async createTenantWithOwner(input: OwnerRegistration): Promise<void> {
    const registration = OwnerRegistrationSchema.parse(input);

    await this.database.transaction(async (transaction) => {
      await transaction.execute(sql`
        INSERT INTO tenants (id, name)
        VALUES (${registration.tenantId}, ${registration.tenantName})
      `);

      await enterTenantContext(transaction, registration.tenantId);

      await transaction.execute(sql`
        INSERT INTO users (id, tenant_id, role, email)
        VALUES (
          ${registration.userId}, ${registration.tenantId}, ${OwnerRole},
          ${registration.email}
        )
      `);
    });
  }
}
