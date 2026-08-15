import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { readSecretKeyRing } from '../secret-key-ring.js';

function key(): string {
  return randomBytes(32).toString('base64');
}

describe('readSecretKeyRing', () => {
  it('reads one versioned key and encrypts with it', () => {
    const material = key();
    const ring = readSecretKeyRing('credentials', { KEY_CREDENTIALS_V1: material });

    expect(ring.currentVersion).toBe(1);
    expect(ring.forVersion(1)).toEqual(Buffer.from(material, 'base64'));
  });

  it('encrypts with the newest version while older ones stay readable', () => {
    const first = key();
    const second = key();
    const ring = readSecretKeyRing('credentials', {
      KEY_CREDENTIALS_V1: first,
      KEY_CREDENTIALS_V2: second
    });

    expect(ring.currentVersion).toBe(2);
    expect(ring.forVersion(2)).toEqual(Buffer.from(second, 'base64'));
    expect(ring.forVersion(1)).toEqual(Buffer.from(first, 'base64'));
  });

  it('says nothing for a version it does not carry', () => {
    const ring = readSecretKeyRing('credentials', { KEY_CREDENTIALS_V1: key() });

    expect(ring.forVersion(2)).toBeUndefined();
  });

  it('keeps purposes apart', () => {
    const env = { KEY_CREDENTIALS_V1: key(), KEY_PHONE_V1: key() };

    expect(readSecretKeyRing('credentials', env).forVersion(1)).not.toEqual(
      readSecretKeyRing('phone', env).forVersion(1)
    );
  });

  it('refuses a ring with no key at all, rather than failing at first use', () => {
    expect(() => readSecretKeyRing('credentials', {})).toThrow(/KEY_CREDENTIALS/);
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() =>
      readSecretKeyRing('credentials', {
        KEY_CREDENTIALS_V1: randomBytes(16).toString('base64')
      })
    ).toThrow(/32 bytes/);
  });

  it('refuses a key that is not base64', () => {
    expect(() =>
      readSecretKeyRing('credentials', { KEY_CREDENTIALS_V1: 'not base64 at all!' })
    ).toThrow(/KEY_CREDENTIALS_V1/);
  });

  it('never puts key material in the refusal', () => {
    const material = randomBytes(16).toString('base64');
    let reported = '';

    try {
      readSecretKeyRing('credentials', { KEY_CREDENTIALS_V1: material });
    } catch (error) {
      reported = error instanceof Error ? `${error.message}${error.stack ?? ''}` : '';
    }

    expect(reported).not.toBe('');
    expect(reported).not.toContain(material);
  });

  it('ignores a variable that only looks like a versioned key', () => {
    const ring = readSecretKeyRing('credentials', {
      KEY_CREDENTIALS_V1: key(),
      KEY_CREDENTIALS_VNEXT: key(),
      KEY_CREDENTIALS: key()
    });

    expect(ring.currentVersion).toBe(1);
  });
});
