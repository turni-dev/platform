import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const WebhookRoutingClaimsSchema = z.strictObject({
  tenantId: z.uuidv7(),
  connectionId: z.uuidv7()
});

export type WebhookRoutingClaims = z.infer<typeof WebhookRoutingClaimsSchema>;

/**
 * The tenant a callback belongs to, carried in the URL a provider was
 * registered with. Row-level security needs a tenant before any row can be
 * read, so a raw connection id in the path would be unusable — and a guessable
 * one at that. Unlike a guest session key this one never expires: the URL
 * lives in the provider's settings, and an expiring callback would simply stop
 * delivering messages one day.
 */
export class WebhookRoutingKeyService {
  private readonly secret: Buffer;

  public constructor(secret: string) {
    this.secret = Buffer.from(secret, 'utf8');
    if (this.secret.length < 32) {
      throw new Error('Webhook routing secret is too short.');
    }
  }

  public issue(claims: WebhookRoutingClaims): string {
    const payload = Buffer.from(
      JSON.stringify(WebhookRoutingClaimsSchema.parse(claims))
    ).toString('base64url');

    return `${payload}.${this.sign(payload)}`;
  }

  public verify(key: string): WebhookRoutingClaims {
    const [payload, signature, ...rest] = key.split('.');
    if (
      payload === undefined ||
      signature === undefined ||
      rest.length > 0 ||
      !this.isSignatureValid(payload, signature)
    ) {
      throw new Error('Invalid webhook routing key.');
    }

    try {
      return WebhookRoutingClaimsSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      );
    } catch {
      throw new Error('Invalid webhook routing key.');
    }
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  private isSignatureValid(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload));
    const actual = Buffer.from(signature);

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
