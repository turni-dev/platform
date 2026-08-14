import { z } from 'zod';

const tokenHash = z.instanceof(Uint8Array).refine((value) => value.length === 32);

export const OwnerSessionRecordSchema = z.strictObject({
  id: z.uuidv7(),
  tenantId: z.uuidv7(),
  userId: z.uuidv7(),
  tokenHash,
  idleExpiresAt: z.date(),
  absoluteExpiresAt: z.date(),
  ipAddress: z.string().trim().min(1).max(45).optional(),
  userAgent: z.string().trim().min(1).max(512).optional()
});

export type OwnerSessionRecord = z.infer<typeof OwnerSessionRecordSchema>;
export type OwnerSessionTokenHash = OwnerSessionRecord['tokenHash'];

export function parseOwnerSessionRecord(input: unknown): OwnerSessionRecord {
  return OwnerSessionRecordSchema.parse(input);
}

export interface OwnerSessionStorePort {
  insert(record: OwnerSessionRecord): Promise<void>;
  findActive(
    input: Readonly<{ tenantId: string; tokenHash: OwnerSessionTokenHash; now: Date }>
  ): Promise<OwnerSessionRecord | undefined>;
  /** Replaces the stored hash in one statement, so a replayed predecessor finds nothing. */
  rotate(
    input: Readonly<{
      tenantId: string;
      currentTokenHash: OwnerSessionTokenHash;
      nextTokenHash: OwnerSessionTokenHash;
      idleExpiresAt: Date;
      now: Date;
    }>
  ): Promise<OwnerSessionRecord | undefined>;
  revoke(
    input: Readonly<{ tenantId: string; tokenHash: OwnerSessionTokenHash }>
  ): Promise<boolean>;
}

export interface OwnerSessionIdGeneratorPort {
  next(): string;
}
