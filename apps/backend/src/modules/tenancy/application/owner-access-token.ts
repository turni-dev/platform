import { createHmac, timingSafeEqual } from 'node:crypto';
import { OwnerRole } from '@turni/contracts';
import { z } from 'zod';

export const ownerAccessTokenLifetimeMs = 10 * 60 * 1000;

const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
  'base64url'
);

const OwnerAccessClaimsSchema = z.strictObject({
  userId: z.uuidv7(),
  tenantId: z.uuidv7(),
  sessionId: z.uuidv7()
});

const OwnerAccessPayloadSchema = z.strictObject({
  sub: z.uuidv7(),
  tenantId: z.uuidv7(),
  role: z.literal(OwnerRole),
  sid: z.uuidv7(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive()
});

export type OwnerAccessClaims = z.infer<typeof OwnerAccessClaimsSchema>;
export type VerifiedOwnerAccess = OwnerAccessClaims & { readonly role: typeof OwnerRole };

/**
 * HS256 access token carrying only routing claims. It is short-lived because
 * it is not revocable on its own: durable revocation lives in `sessions`.
 */
export class OwnerAccessTokenService {
  public constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error('Owner access token secret must be at least 32 characters');
    }
  }

  public issue(claims: OwnerAccessClaims, now = new Date()): string {
    const parsed = OwnerAccessClaimsSchema.parse(claims);
    const issuedAtSeconds = Math.floor(now.getTime() / 1_000);
    const payload = Buffer.from(
      JSON.stringify({
        sub: parsed.userId,
        tenantId: parsed.tenantId,
        role: OwnerRole,
        sid: parsed.sessionId,
        iat: issuedAtSeconds,
        exp: Math.floor((now.getTime() + ownerAccessTokenLifetimeMs) / 1_000)
      })
    ).toString('base64url');

    return `${header}.${payload}.${this.signatureFor(payload)}`;
  }

  public verify(token: string, now = new Date()): VerifiedOwnerAccess {
    const [tokenHeader, payload, signature, ...extraParts] = token.split('.');
    if (
      tokenHeader !== header ||
      !payload ||
      !signature ||
      extraParts.length > 0 ||
      !this.signatureMatches(payload, signature)
    ) {
      throw new Error('Invalid owner access token');
    }

    let claims: z.infer<typeof OwnerAccessPayloadSchema>;
    try {
      claims = OwnerAccessPayloadSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      );
    } catch {
      throw new Error('Invalid owner access token');
    }

    if (claims.exp * 1_000 <= now.getTime()) {
      throw new Error('Expired owner access token');
    }

    return {
      userId: claims.sub,
      tenantId: claims.tenantId,
      sessionId: claims.sid,
      role: claims.role
    };
  }

  private signatureMatches(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.signatureFor(payload), 'base64url');
    const received = Buffer.from(signature, 'base64url');

    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  private signatureFor(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
  }
}
