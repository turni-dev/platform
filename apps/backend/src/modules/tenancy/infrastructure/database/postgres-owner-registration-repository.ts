import { sql } from 'drizzle-orm';
import { OwnerRole } from '@turni/contracts';
import {
  enterTenantContext,
  type TenantDatabase
} from '../../../../platform/database/with-tenant.js';
import { z } from 'zod';
import {
  OwnerDirectoryEntrySchema,
  OwnerProfileSchema,
  OwnerRegistrationSchema,
  type OwnerDirectoryEntry,
  type OwnerProfile,
  type OwnerRegistration,
  type OwnerRegistrationRepositoryPort
} from '../../application/owner-registration-repository.port.js';
import { normalizeOwnerEmail } from '../../domain/owner-auth-challenge.js';

const DirectoryRowSchema = z.strictObject({
  email: z.string(),
  tenant_id: z.uuidv7(),
  user_id: z.uuidv7()
});

const ProfileRowSchema = z.strictObject({
  user_id: z.uuidv7(),
  tenant_id: z.uuidv7(),
  tenant_name: z.string(),
  email: z.string()
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

  public async findOwnerProfile(
    owner: Readonly<{ tenantId: string; userId: string }>
  ): Promise<OwnerProfile | undefined> {
    return this.database.transaction(async (transaction) => {
      await enterTenantContext(transaction, owner.tenantId);

      const rows = z
        .array(ProfileRowSchema)
        .parse(
          await transaction.execute(sql`
            SELECT
              users.id AS user_id,
              users.tenant_id,
              tenants.name AS tenant_name,
              users.email
            FROM users
            JOIN tenants ON tenants.id = users.tenant_id
            WHERE users.tenant_id = ${owner.tenantId}
              AND users.id = ${owner.userId}
              AND users.role = ${OwnerRole}
            LIMIT 1
          `)
        )
        .map((row) =>
          OwnerProfileSchema.parse({
            userId: row.user_id,
            tenantId: row.tenant_id,
            tenantName: row.tenant_name,
            email: row.email
          })
        );

      return rows[0];
    });
  }
}
