import { OwnerEmailSchema } from '@turni/contracts';
import { z } from 'zod';

export const OwnerRegistrationSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7(),
  tenantName: z.string().trim().min(1).max(200),
  email: OwnerEmailSchema
});

export const OwnerDirectoryEntrySchema = z.strictObject({
  email: OwnerEmailSchema,
  tenantId: z.uuidv7(),
  userId: z.uuidv7()
});

export const OwnerProfileSchema = z.strictObject({
  userId: z.uuidv7(),
  tenantId: z.uuidv7(),
  tenantName: z.string().trim().min(1).max(200),
  email: OwnerEmailSchema
});

export type OwnerRegistration = z.infer<typeof OwnerRegistrationSchema>;
export type OwnerDirectoryEntry = z.infer<typeof OwnerDirectoryEntrySchema>;
export type OwnerProfile = z.infer<typeof OwnerProfileSchema>;

export interface OwnerRegistrationRepositoryPort {
  /**
   * Creates the tenant and its first owner atomically. It is the only write
   * that starts without a tenant context; the owner row is still created
   * inside one, so RLS covers it from its first statement.
   */
  createTenantWithOwner(registration: OwnerRegistration): Promise<void>;
  /**
   * Resolves the tenant that owns an email before any tenant context exists.
   * `owner_directory` is the only table that answers this question; the rows it
   * points at stay behind FORCE RLS.
   */
  findOwnerByEmail(email: string): Promise<OwnerDirectoryEntry | undefined>;
  /**
   * Reads the owner an authenticated session points at. Unlike the directory
   * lookup this one runs inside the tenant context, so RLS answers it.
   */
  findOwnerProfile(
    owner: Readonly<{ tenantId: string; userId: string }>
  ): Promise<OwnerProfile | undefined>;
}
