import { randomBytes } from 'node:crypto';

const UUID_BYTE_LENGTH = 16;
const RANDOM_BYTE_LENGTH = 10;

export interface UuidV7GeneratorPort {
  next(): string;
}

export interface UuidV7GeneratorOptions {
  now?: () => number;
  randomBytes?: (size: number) => Uint8Array;
}

export class UuidV7Generator implements UuidV7GeneratorPort {
  private readonly now: () => number;
  private readonly getRandomBytes: (size: number) => Uint8Array;

  public constructor(options: UuidV7GeneratorOptions = {}) {
    this.now = options.now ?? Date.now;
    this.getRandomBytes = options.randomBytes ?? randomBytes;
  }

  public next(): string {
    const timestamp = this.now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= 2 ** 48) {
      throw new Error('UUIDv7 timestamp must fit in 48 bits');
    }

    const random = this.getRandomBytes(RANDOM_BYTE_LENGTH);
    if (random.length !== RANDOM_BYTE_LENGTH) {
      throw new Error('UUIDv7 random source returned an invalid byte count');
    }

    const bytes = new Uint8Array(UUID_BYTE_LENGTH);
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = Math.floor(timestamp / 2 ** (8 * (5 - index))) & 0xff;
    }

    bytes[6] = 0x70 | (random[0]! & 0x0f);
    bytes[7] = random[1]!;
    bytes[8] = 0x80 | (random[2]! & 0x3f);
    bytes.set(random.slice(3), 9);

    return formatUuid(bytes);
  }
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
