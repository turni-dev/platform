import { OwnerEmailSchema } from '@turni/contracts';
import { z } from 'zod';
import { maxOwnerAuthAttempts } from '../domain/owner-auth-challenge.js';

export const OwnerAuthChallengeRecordSchema = z.strictObject({
  id: z.uuidv7(),
  email: OwnerEmailSchema,
  codeHash: z.string().trim().min(43).max(128),
  attempts: z.number().int().min(0).max(maxOwnerAuthAttempts),
  expiresAt: z.date(),
  consumedAt: z.date().optional()
});

export type OwnerAuthChallengeRecord = z.infer<typeof OwnerAuthChallengeRecordSchema>;

export function parseOwnerAuthChallengeRecord(
  input: unknown
): OwnerAuthChallengeRecord {
  return OwnerAuthChallengeRecordSchema.parse(input);
}

export interface OwnerAuthChallengeStorePort {
  insert(record: OwnerAuthChallengeRecord): Promise<void>;
  findActiveByEmail(
    input: Readonly<{ email: string; now: Date }>
  ): Promise<OwnerAuthChallengeRecord | undefined>;
  incrementAttempts(
    input: Readonly<{ id: string; now: Date }>
  ): Promise<number | undefined>;
  consume(input: Readonly<{ id: string; consumedAt: Date }>): Promise<boolean>;
}
