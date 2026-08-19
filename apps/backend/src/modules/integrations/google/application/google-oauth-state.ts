import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const GoogleOauthStateClaimsSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7()
});

export type GoogleOauthStateClaims = z.infer<typeof GoogleOauthStateClaimsSchema>;

const GoogleOauthStatePayloadSchema = GoogleOauthStateClaimsSchema.extend({
  issuedAt: z.iso.datetime()
});

/** Not a dot: this string travels inside a URL query parameter, same
 * reasoning as {@link WebhookRoutingKeyService}. */
const separator = '~';

/** Five minutes is a browser round trip to Google's consent screen and back,
 * never a URL that has to keep working — unlike a webhook routing key this
 * state is never registered anywhere and only has to survive one redirect. */
const ttlMs = 5 * 60 * 1000;

/**
 * Signs the tenant and user behind an OAuth consent request so the callback
 * can trust who it belongs to without a session — Google's redirect carries
 * no cookie. Single-use: a state that already unlocked one callback must
 * never unlock a second, replayed one.
 */
export class GoogleOauthStateService {
  private readonly secret: Buffer;
  private readonly clock: () => Date;
  private readonly consumed = new Map<string, number>();

  public constructor(secret: string, clock: () => Date = () => new Date()) {
    this.secret = Buffer.from(secret, 'utf8');
    if (this.secret.length < 32) {
      throw new Error('Google OAuth state secret is too short.');
    }
    this.clock = clock;
  }

  public issue(claims: GoogleOauthStateClaims): string {
    const payload = Buffer.from(
      JSON.stringify(
        GoogleOauthStatePayloadSchema.parse({
          ...GoogleOauthStateClaimsSchema.parse(claims),
          issuedAt: this.clock().toISOString()
        })
      )
    ).toString('base64url');

    return [payload, this.sign(payload)].join(separator);
  }

  public verify(state: string): GoogleOauthStateClaims {
    this.prune();

    const [payload, signature, ...rest] = state.split(separator);
    if (
      payload === undefined ||
      signature === undefined ||
      rest.length > 0 ||
      !this.isSignatureValid(payload, signature)
    ) {
      throw new Error('Invalid Google OAuth state.');
    }

    if (this.consumed.has(state)) {
      throw new Error('Google OAuth state was already used.');
    }

    const parsed = this.parsePayload(payload);
    const ageMs = this.clock().getTime() - new Date(parsed.issuedAt).getTime();
    if (ageMs < 0 || ageMs > ttlMs) {
      throw new Error('Google OAuth state has expired.');
    }

    this.consumed.set(state, new Date(parsed.issuedAt).getTime() + ttlMs);

    return { tenantId: parsed.tenantId, userId: parsed.userId };
  }

  private parsePayload(payload: string): z.infer<typeof GoogleOauthStatePayloadSchema> {
    try {
      return GoogleOauthStatePayloadSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
      );
    } catch {
      throw new Error('Invalid Google OAuth state.');
    }
  }

  /** Drops consumed entries whose expiry has passed; keeps the in-memory set
   * from growing without bound in a long-lived process. */
  private prune(): void {
    const now = this.clock().getTime();
    for (const [key, expiresAt] of this.consumed) {
      if (expiresAt < now) {
        this.consumed.delete(key);
      }
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
