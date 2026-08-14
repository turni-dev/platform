import { OwnerEmailSchema } from '@turni/contracts';
import { z } from 'zod';

export const OwnerRegistrationSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7(),
  tenantName: z.string().trim().min(1).max(200),
  email: OwnerEmailSchema
});

export type OwnerRegistration = z.infer<typeof OwnerRegistrationSchema>;

export interface OwnerRegistrationRepositoryPort {
  /**
   * Creates the tenant and its first owner atomically. It is the only write
   * that starts without a tenant context; the owner row is still created
   * inside one, so RLS covers it from its first statement.
   */
  createTenantWithOwner(registration: OwnerRegistration): Promise<void>;
}
