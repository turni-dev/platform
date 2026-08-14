import { OwnerAuthCodeSchema, OwnerEmailSchema } from '@turni/contracts';
import { z } from 'zod';

export const OwnerAuthCodeMessageSchema = z.strictObject({
  email: OwnerEmailSchema,
  code: OwnerAuthCodeSchema,
  expiresAt: z.date()
});

export type OwnerAuthCodeMessage = z.infer<typeof OwnerAuthCodeMessageSchema>;

/**
 * Delivers a one-time code to the owner. Implementations never log the code
 * and never report whether the address is already registered.
 */
export interface OwnerAuthNotifierPort {
  sendCode(message: OwnerAuthCodeMessage): Promise<void>;
}
