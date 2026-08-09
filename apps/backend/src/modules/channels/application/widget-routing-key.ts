import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const WidgetRoutingClaimsSchema = z.strictObject({
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  connectionId: z.uuidv7(),
  expiresAt: z.number().int().positive(),
  kid: z.string().min(1).max(100)
});

export type WidgetRoutingClaims = z.infer<typeof WidgetRoutingClaimsSchema>;

export class WidgetRoutingKeyService {
  private readonly secret: Buffer;

  public constructor(secret: string) {
    this.secret = Buffer.from(secret, 'utf8');
    if (this.secret.length < 32) throw new Error('Routing key secret is too short.');
  }

  public issue(claims: WidgetRoutingClaims): string {
    const payload = Buffer.from(JSON.stringify(WidgetRoutingClaimsSchema.parse(claims))).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  public verify(key: string, nowSeconds = Math.floor(Date.now() / 1_000)): WidgetRoutingClaims {
    const [payload, signature, ...rest] = key.split('.');
    if (payload === undefined || signature === undefined || rest.length > 0 || !this.isSignatureValid(payload, signature)) {
      throw new Error('Invalid widget routing key.');
    }
    try {
      const claims = WidgetRoutingClaimsSchema.parse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
      if (claims.expiresAt <= nowSeconds) throw new Error('expired');
      return claims;
    } catch {
      throw new Error('Invalid widget routing key.');
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
