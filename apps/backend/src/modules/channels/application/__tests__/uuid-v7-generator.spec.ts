import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { UuidV7Generator } from '../uuid-v7-generator.js';

describe('UuidV7Generator', () => {
  it('creates an RFC 9562 UUIDv7 with the supplied millisecond timestamp', () => {
    const generator = new UuidV7Generator({
      now: () => 1_721_234_567_890,
      randomBytes: () => Uint8Array.from([0xab, 0xcd, 0xef, 1, 2, 3, 4, 5, 6, 7])
    });

    const id = generator.next();

    expect(z.uuidv7().safeParse(id).success).toBe(true);
    expect(id.slice(0, 8)).toBe('0190c193');
    expect(id[14]).toBe('7');
    expect(['8', '9', 'a', 'b']).toContain(id[19]);
  });
});
