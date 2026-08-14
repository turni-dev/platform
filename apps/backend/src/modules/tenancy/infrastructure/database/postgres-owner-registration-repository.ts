import { sql } from 'drizzle-orm';
import { OwnerRole } from '@turni/contracts';
import {
  enterTenantContext,
  type TenantDatabase
} from '../../../../platform/database/with-tenant.js';
import { z } from 'zod';
import {
  OwnerDirectoryEntrySchema,
  OwnerRegistrationSchema,
  type OwnerDirectoryEntry,
  type OwnerRegistration,
  type OwnerRegistrationRepositoryPort
} from '../../application/owner-registration-repository.port.js';
import { normalizeOwnerEmail } from '../../domain/owner-auth-challenge.js';

const DirectoryRowSchema = z.strictObject({
  email: z.string(),
  tenant_id: z.uuidv7(),
  user_id: z.uuidv7()
});

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

      await transaction.execute(sql`
        INSERT INTO owner_directory (email, tenant_id, user_id)
        VALUES (
          ${registration.email}, ${registration.tenantId}, ${registration.userId}
        )
      `);
    });
  }

  public async findOwnerByEmail(
    email: string
  ): Promise<OwnerDirectoryEntry | undefined> {
    const normalized = normalizeOwnerEmail(email);

    return this.database.transaction(async (transaction) => {
      const rows = z
        .array(DirectoryRowSchema)
        .parse(
          await transaction.execute(sql`
            SELECT email, tenant_id, user_id
            FROM owner_directory
            WHERE email = ${normalized}
            LIMIT 1
          `)
        )
        .map((row) =>
          OwnerDirectoryEntrySchema.parse({
            email: row.email,
            tenantId: row.tenant_id,
            userId: row.user_id
          })
        );

      return rows[0];
    });
  }
}
