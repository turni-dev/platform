/**
 * Per-purpose data keys, as required by the security note (A04): channel
 * credentials and guest phone numbers are different purposes and therefore
 * never share a key, so compromising one never reads the other.
 */
export type SecretPurpose = 'credentials' | 'phone';

/** AES-256 takes exactly this much key material. */
export const secretKeyLength = 32;

const base64Alphabet = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * The keys of one purpose, newest first. Encryption always uses the newest;
 * decryption asks for whichever version the stored value names, so a rotation
 * is adding a key and deploying — old rows keep working until re-encrypted.
 */
export interface SecretKeyRing {
  readonly currentVersion: number;
  forVersion(version: number): Buffer | undefined;
  /** Key material must survive neither a log line nor a serialized error. */
  toJSON(): string;
}

export function readSecretKeyRing(
  purpose: SecretPurpose,
  env: NodeJS.ProcessEnv = process.env
): SecretKeyRing {
  const prefix = `KEY_${purpose.toUpperCase()}_V`;
  const keys = new Map<number, Buffer>();

  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith(prefix) || value === undefined) {
      continue;
    }

    const version = Number(name.slice(prefix.length));
    if (!Number.isInteger(version) || version < 1) {
      continue;
    }

    keys.set(version, decodeKey(name, value));
  }

  if (keys.size === 0) {
    throw new Error(`${prefix}1 is required: no key is configured for ${purpose}`);
  }

  return {
    currentVersion: Math.max(...keys.keys()),
    forVersion: (version) => keys.get(version),
    toJSON: () => `[${purpose} key ring, ${keys.size} version(s)]`
  };
}

/** Refusals name the variable and never carry its value. */
function decodeKey(name: string, value: string): Buffer {
  if (value.length % 4 !== 0 || !base64Alphabet.test(value)) {
    throw new Error(`${name} must be base64`);
  }

  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== secretKeyLength) {
    throw new Error(`${name} must decode to ${secretKeyLength} bytes`);
  }

  return decoded;
}
