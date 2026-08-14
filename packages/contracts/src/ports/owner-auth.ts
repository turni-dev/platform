import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common.js';

export const OwnerEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
export const OwnerAuthCodeSchema = z.string().regex(/^\d{6}$/);
export const OwnerRole = 'owner' as const;

export const OwnerAuthRequestSchema = z.strictObject({
  email: OwnerEmailSchema
});

export const OwnerAuthVerifyRequestSchema = z.strictObject({
  email: OwnerEmailSchema,
  code: OwnerAuthCodeSchema
});

export const OwnerAuthChallengeSchema = z.strictObject({
  challengeId: UuidSchema,
  expiresAt: IsoDateTimeSchema,
  resendAfterSeconds: z.number().int().nonnegative().max(600)
});

export const OwnerIdentitySchema = z.strictObject({
  userId: UuidSchema,
  tenantId: UuidSchema,
  tenantName: z.string().trim().min(1).max(200),
  email: OwnerEmailSchema,
  role: z.literal(OwnerRole)
});

export type OwnerAuthRequest = z.infer<typeof OwnerAuthRequestSchema>;
export type OwnerAuthVerifyRequest = z.infer<typeof OwnerAuthVerifyRequestSchema>;
export type OwnerAuthChallenge = z.infer<typeof OwnerAuthChallengeSchema>;
export type OwnerIdentity = z.infer<typeof OwnerIdentitySchema>;
