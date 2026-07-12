import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  GuestSessionRequestSchema,
  GuestSessionSchema,
  type GuestSession,
  type GuestSessionRequest
} from '@turni/contracts';
import { z } from 'zod';

const sessionLifetimeMs = 15 * 60 * 1000;

const GuestSessionClaimsSchema = z.strictObject({
  widgetKey: z.string().trim().min(1).max(128),
  expiresAt: z.number().int().positive(),
  nonce: z.uuid()
});

type GuestSessionClaims = z.infer<typeof GuestSessionClaimsSchema>;

export class GuestSessionService {
  constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error('Guest session secret must be at least 32 characters');
    }
  }

  issue(request: GuestSessionRequest, now = new Date()): GuestSession {
    const parsedRequest = GuestSessionRequestSchema.parse(request);
    const expiresAt = new Date(now.getTime() + sessionLifetimeMs);
    const claims: GuestSessionClaims = {
      widgetKey: parsedRequest.widgetKey,
      expiresAt: expiresAt.getTime(),
      nonce: randomUUID()
    };

    return GuestSessionSchema.parse({
      token: this.sign(claims),
      expiresAt: expiresAt.toISOString()
    });
  }

  verify(token: string, now = new Date()): Pick<GuestSessionClaims, 'widgetKey'> {
    const [encodedClaims, signature, ...extraParts] = token.split('.');
    if (!encodedClaims || !signature || extraParts.length > 0) {
      throw new Error('Invalid guest session');
    }

    const expectedSignature = this.signatureFor(encodedClaims);
    const receivedSignature = Buffer.from(signature, 'base64url');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'base64url');

    if (
      receivedSignature.length !== expectedSignatureBuffer.length ||
      !timingSafeEqual(receivedSignature, expectedSignatureBuffer)
    ) {
      throw new Error('Invalid guest session');
    }

    let claims: GuestSessionClaims;
    try {
      claims = GuestSessionClaimsSchema.parse(
        JSON.parse(Buffer.from(encodedClaims, 'base64url').toString('utf8'))
      );
    } catch {
      throw new Error('Invalid guest session');
    }

    if (claims.expiresAt <= now.getTime()) {
      throw new Error('Expired guest session');
    }

    return { widgetKey: claims.widgetKey };
  }

  private sign(claims: GuestSessionClaims): string {
    const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${encodedClaims}.${this.signatureFor(encodedClaims)}`;
  }

  private signatureFor(encodedClaims: string): string {
    return createHmac('sha256', this.secret).update(encodedClaims).digest('base64url');
  }
}
