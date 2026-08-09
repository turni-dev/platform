import { z } from 'zod';

const HashSchema = z.instanceof(Uint8Array).refine((value) => value.length === 32);
const BaseSchema = z.strictObject({
  id: z.uuidv7(), tenantId: z.uuidv7(), agentId: z.uuidv7(), connectionId: z.uuidv7(),
  guestId: z.uuidv7().optional(), tokenHash: HashSchema, tokenKid: z.string().min(1),
  issuedAt: z.date(), expiresAt: z.date(), revokedAt: z.date().optional()
});
export type GuestSessionStoreRecord = z.infer<typeof BaseSchema>;
export interface GuestSessionStorePort {
  insert(input: GuestSessionStoreRecord): Promise<void>;
  findByTokenHash(input: Readonly<{ tenantId: string; tokenHash: Uint8Array }>): Promise<GuestSessionStoreRecord | undefined>;
  revoke(input: Readonly<{ tenantId: string; tokenHash: Uint8Array; revokedAt: Date }>): Promise<boolean>;
  markUsedByTokenHash(input: Readonly<{ tenantId: string; tokenHash: Uint8Array; lastUsedAt: Date }>): Promise<boolean>;
}
export interface UuidV7GeneratorPort { next(): string; }
export const parseGuestSessionStoreRecord = (input: unknown): GuestSessionStoreRecord => BaseSchema.parse(input);
