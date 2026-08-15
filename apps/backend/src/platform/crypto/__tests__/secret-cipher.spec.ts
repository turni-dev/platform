import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretCipher, SecretDecryptionError } from '../secret-cipher.js';
import { readSecretKeyRing } from '../secret-key-ring.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const otherTenantId = '01900000-0000-7000-8000-000000000002';

function cipherWith(...versions: readonly string[]): SecretCipher {
  const env: NodeJS.ProcessEnv = {};
  versions.forEach((material, index) => {
    env[`KEY_CREDENTIALS_V${index + 1}`] = material;
  });

  return new SecretCipher('credentials', readSecretKeyRing('credentials', env));
}

function material(): string {
  return randomBytes(32).toString('base64');
}

describe('SecretCipher', () => {
  it('returns the secret it was given', () => {
    const cipher = cipherWith(material());
    const token = '7712345678:AAH-secret-bot-token';

    const stored = cipher.encrypt(token, tenantId);

    expect(cipher.decrypt(stored, tenantId)).toBe(token);
  });

  it('survives non-latin text and emoji', () => {
    const cipher = cipherWith(material());
    const secret = 'Пароль от Кофейни на Ленина ☕';

    expect(cipher.decrypt(cipher.encrypt(secret, tenantId), tenantId)).toBe(secret);
  });

  it('stores the version, iv, ciphertext and tag as the schema prescribes', () => {
    const stored = cipherWith(material()).encrypt('token', tenantId);
    const segments = stored.split(':');

    expect(segments).toHaveLength(4);
    expect(segments[0]).toBe('v1');
    expect(Buffer.from(segments[1] ?? '', 'base64')).toHaveLength(12);
    expect(Buffer.from(segments[3] ?? '', 'base64')).toHaveLength(16);
  });

  it('never writes the plaintext into the stored value', () => {
    const cipher = cipherWith(material());

    expect(cipher.encrypt('bot-token', tenantId)).not.toContain('bot-token');
  });

  it('spends a fresh iv on every call', () => {
    const cipher = cipherWith(material());

    expect(cipher.encrypt('token', tenantId)).not.toBe(cipher.encrypt('token', tenantId));
  });

  it('encrypts with the newest key while older versions stay readable', () => {
    const first = material();
    const storedUnderV1 = cipherWith(first).encrypt('token', tenantId);
    const rotated = cipherWith(first, material());

    expect(rotated.encrypt('token', tenantId).startsWith('v2:')).toBe(true);
    expect(rotated.decrypt(storedUnderV1, tenantId)).toBe('token');
  });

  it('refuses a value encrypted for another tenant', () => {
    const cipher = cipherWith(material());
    const stored = cipher.encrypt('token', tenantId);

    expect(() => cipher.decrypt(stored, otherTenantId)).toThrow(SecretDecryptionError);
  });

  it('refuses a value encrypted for another purpose', () => {
    const shared = material();
    const stored = new SecretCipher(
      'credentials',
      readSecretKeyRing('credentials', { KEY_CREDENTIALS_V1: shared })
    ).encrypt('token', tenantId);
    const phone = new SecretCipher(
      'phone',
      readSecretKeyRing('phone', { KEY_PHONE_V1: shared })
    );

    expect(() => phone.decrypt(stored, tenantId)).toThrow(SecretDecryptionError);
  });

  it('refuses a value whose key version it does not carry', () => {
    const stored = cipherWith(material(), material()).encrypt('token', tenantId);

    expect(() => cipherWith(material()).decrypt(stored, tenantId)).toThrow(
      SecretDecryptionError
    );
  });

  it('refuses a tampered ciphertext, iv or tag', () => {
    const cipher = cipherWith(material());
    const segments = cipher.encrypt('token', tenantId).split(':');

    for (const index of [1, 2, 3]) {
      const damaged = [...segments];
      damaged[index] = flip(segments[index] ?? '');

      expect(() => cipher.decrypt(damaged.join(':'), tenantId)).toThrow(
        SecretDecryptionError
      );
    }
  });

  it('refuses anything that is not the stored format', () => {
    const cipher = cipherWith(material());

    for (const malformed of ['', 'token', 'v1:only:three', 'v1:a:b:c:d', 'vx:a:b:c']) {
      expect(() => cipher.decrypt(malformed, tenantId)).toThrow(SecretDecryptionError);
    }
  });

  it('explains nothing: every failure reads the same and leaks nothing', () => {
    const key = material();
    const cipher = cipherWith(key);
    const stored = cipher.encrypt('bot-token', tenantId);
    const failures = [
      () => cipher.decrypt(stored, otherTenantId),
      () => cipher.decrypt('v9:a:b:c', tenantId),
      () => cipher.decrypt('nonsense', tenantId)
    ];

    const messages = failures.map((attempt) => {
      try {
        attempt();

        return 'no failure';
      } catch (error) {
        return error instanceof Error ? error.message : 'unknown';
      }
    });

    expect(new Set(messages).size).toBe(1);
    for (const message of messages) {
      expect(message).not.toContain('bot-token');
      expect(message).not.toContain(key);
      expect(message).not.toContain(tenantId);
    }
  });

  it('refuses to encrypt an empty secret, which is never a real credential', () => {
    expect(() => cipherWith(material()).encrypt('', tenantId)).toThrow();
  });
});

function flip(segment: string): string {
  const bytes = Buffer.from(segment, 'base64');
  const first = bytes[0] ?? 0;
  bytes[0] = first ^ 0xff;

  return bytes.toString('base64');
}
