import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const OwnerSessionHintSchema = z.strictObject({
  sessionId: z.uuidv7(),
  tenantId: z.uuidv7()
});

type OwnerSessionHint = z.infer<typeof OwnerSessionHintSchema>;

export interface IssuedOwnerSessionCredential {
  readonly credential: string;
  readonly tokenHash: Uint8Array<ArrayBuffer>;
}

export interface VerifiedOwnerSessionCredential extends OwnerSessionHint {
  readonly tokenHash: Uint8Array<ArrayBuffer>;
}

/**
 * A refresh credential is `hint.secret.signature`: an opaque 32-byte secret,
 * a signed routing hint that lets the reader open the owning tenant context,
 * and an HMAC binding the two. Postgres stores only `sha256(secret)`, so a
 * stolen database row cannot be replayed as a credential.
 */
export class OwnerSessionCredentialService {
  public constructor(private readonly secret: string) {
    if (secret.length < 32) {
      throw new Error('Owner session secret must be at least 32 characters');
    }
  }

  public issue(
    hint: OwnerSessionHint,
    random: (size: number) => Buffer = randomBytes
  ): IssuedOwnerSessionCredential {
    const parsedHint = OwnerSessionHintSchema.parse(hint);
    const encodedHint = Buffer.from(JSON.stringify(parsedHint)).toString('base64url');
    const opaque = random(32).toString('base64url');

    return {
      credential: `${encodedHint}.${opaque}.${this.signatureFor(encodedHint, opaque)}`,
      tokenHash: hashOpaque(opaque)
    };
  }

  public verify(credential: string): VerifiedOwnerSessionCredential {
    const [encodedHint, opaque, signature, ...extraParts] = credential.split('.');
    if (!encodedHint || !opaque || !signature || extraParts.length > 0) {
      throw new Error('Invalid owner session');
    }
    if (!this.signatureMatches(encodedHint, opaque, signature)) {
      throw new Error('Invalid owner session');
    }

    let hint: OwnerSessionHint;
    try {
      hint = OwnerSessionHintSchema.parse(
        JSON.parse(Buffer.from(encodedHint, 'base64url').toString('utf8'))
      );
    } catch {
      throw new Error('Invalid owner session');
    }

    return { ...hint, tokenHash: hashOpaque(opaque) };
  }

  private signatureMatches(
    encodedHint: string,
    opaque: string,
    signature: string
  ): boolean {
    const expected = Buffer.from(this.signatureFor(encodedHint, opaque), 'base64url');
    const received = Buffer.from(signature, 'base64url');

    return expected.length === received.length && timingSafeEqual(expected, received);
  }

  private signatureFor(encodedHint: string, opaque: string): string {
    return createHmac('sha256', this.secret)
      .update(`${encodedHint}.${opaque}`)
      .digest('base64url');
  }
}

function hashOpaque(opaque: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(createHash('sha256').update(opaque).digest());
}
