import { z } from 'zod';

export const WebhookInboxClaimSchema = z.strictObject({
  id: z.uuidv7(),
  source: z.enum(['telegram', 'yookassa', 'vk']),
  externalId: z.string().min(1),
  payload: z.record(z.string(), z.unknown())
});

export type WebhookInboxClaim = z.infer<typeof WebhookInboxClaimSchema>;

/**
 * The provider's retry is our only redelivery mechanism, so a claim has to be
 * honest about two different repeats: an event already answered must never be
 * answered again, while an event that failed must be allowed through on the
 * next retry.
 */
export interface WebhookInboxPort {
  claim(claim: WebhookInboxClaim): Promise<'claimed' | 'duplicate'>;
  markProcessed(
    input: Readonly<{ source: string; externalId: string }>
  ): Promise<void>;
  markFailed(
    input: Readonly<{ source: string; externalId: string; error: string }>
  ): Promise<void>;
}
