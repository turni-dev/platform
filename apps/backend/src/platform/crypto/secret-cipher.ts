import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretKeyRing, SecretPurpose } from './secret-key-ring.js';

const algorithm = 'aes-256-gcm';
const ivLength = 12;
const tagLength = 16;

/** `v1:iv:ct:tag`, the storage format prescribed by the database note. */
const storedFormat = /^v([1-9][0-9]*):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/;

/**
 * One refusal for every way decryption can fail — wrong tenant, wrong purpose,
 * unknown key version, tampered segment, malformed input. An attacker who can
 * feed us values learns nothing about which part he got wrong, and the message
 * is safe to log.
 */
export class SecretDecryptionError extends Error {
  public constructor() {
    super('Secret could not be decrypted');
    this.name = 'SecretDecryptionError';
  }
}

/**
 * Encrypts one purpose of tenant-scoped secret. The tenant and the purpose are
 * authenticated alongside the ciphertext, so a value moved into another
 * tenant's row — by a restore, a repair script or a future admin path — fails
 * to decrypt instead of quietly working.
 */
export class SecretCipher {
  public constructor(
    private readonly purpose: SecretPurpose,
    private readonly keys: SecretKeyRing
  ) {}

  public encrypt(secret: string, tenantId: string): string {
    if (secret.length === 0) {
      throw new Error('An empty secret is never a real credential');
    }

    const version = this.keys.currentVersion;
    const key = this.keys.forVersion(version);
    if (key === undefined) {
      throw new Error(`No key configured for ${this.purpose} version ${version}`);
    }

    const iv = randomBytes(ivLength);
    const cipher = createCipheriv(algorithm, key, iv);
    cipher.setAAD(this.context(tenantId));
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

    return [
      `v${version}`,
      iv.toString('base64'),
      ciphertext.toString('base64'),
      cipher.getAuthTag().toString('base64')
    ].join(':');
  }

  public decrypt(stored: string, tenantId: string): string {
    try {
      return this.open(stored, tenantId);
    } catch {
      throw new SecretDecryptionError();
    }
  }

  private open(stored: string, tenantId: string): string {
    const parsed = storedFormat.exec(stored);
    if (parsed === null) {
      throw new SecretDecryptionError();
    }

    const [, version, encodedIv, encodedCiphertext, encodedTag] = parsed;
    const key = this.keys.forVersion(Number(version));
    const iv = Buffer.from(encodedIv ?? '', 'base64');
    const tag = Buffer.from(encodedTag ?? '', 'base64');
    if (key === undefined || iv.length !== ivLength || tag.length !== tagLength) {
      throw new SecretDecryptionError();
    }

    const decipher = createDecipheriv(algorithm, key, iv);
    decipher.setAAD(this.context(tenantId));
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(Buffer.from(encodedCiphertext ?? '', 'base64')),
      decipher.final()
    ]).toString('utf8');
  }

  /** Authenticated, not encrypted: it binds the value to where it belongs. */
  private context(tenantId: string): Buffer {
    return Buffer.from(`${this.purpose}:${tenantId}`, 'utf8');
  }
}
