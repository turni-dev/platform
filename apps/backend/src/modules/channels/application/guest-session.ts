import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  GuestSessionRequestSchema,
  GuestSessionSchema,
  type GuestSession,
  type GuestSessionRequest
} from '@turni/contracts';
import { z } from 'zod';
import {
  WidgetRoutingKeyService,
  WidgetRoutingClaimsSchema,
  type WidgetRoutingClaims
} from './widget-routing-key.js';

const sessionLifetimeMs = 15 * 60 * 1000;

const GuestSessionClaimsSchema = z.strictObject({
  widgetKey: z.string().trim().min(1).max(2048),
  routing: WidgetRoutingClaimsSchema,
  expiresAt: z.number().int().positive(),
  nonce: z.uuid()
});

type GuestSessionClaims = z.infer<typeof GuestSessionClaimsSchema>;

export class GuestSessionService {
  private readonly routingKeys: Pick<WidgetRoutingKeyService, 'verify'>;

  public constructor(secret: string, routingKeys?: Pick<WidgetRoutingKeyService, 'verify'>) {
    if (secret.length < 32) {
      throw new Error('Guest session secret must be at least 32 characters');
    }
    this.secret = secret;
    this.routingKeys = routingKeys ?? new WidgetRoutingKeyService(secret);
  }

  private readonly secret: string;

  issue(request: GuestSessionRequest, now = new Date()): GuestSession {
    const parsedRequest = GuestSessionRequestSchema.parse(request);
    const routing = this.routingKeys.verify(
      parsedRequest.widgetKey,
      Math.floor(now.getTime() / 1_000)
    );
    const expiresAt = new Date(
      Math.min(now.getTime() + sessionLifetimeMs, routing.expiresAt * 1_000)
    );
    const claims: GuestSessionClaims = {
      widgetKey: parsedRequest.widgetKey,
      routing,
      expiresAt: expiresAt.getTime(),
      nonce: randomUUID()
    };

    return GuestSessionSchema.parse({
      token: this.sign(claims),
      expiresAt: expiresAt.toISOString()
    });
  }

  verify(token: string, now = new Date()): WidgetRoutingClaims & { readonly widgetKey: string } {
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

    return { widgetKey: claims.widgetKey, ...claims.routing };
  }

  private sign(claims: GuestSessionClaims): string {
    const encodedClaims = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return `${encodedClaims}.${this.signatureFor(encodedClaims)}`;
  }

  private signatureFor(encodedClaims: string): string {
    return createHmac('sha256', this.secret).update(encodedClaims).digest('base64url');
  }
}
