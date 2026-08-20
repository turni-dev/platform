import { describe, expect, it } from 'vitest';
import { UuidV7Generator } from '../uuid-v7-generator.js';

describe('UuidV7Generator', () => {
  it('produces a version-7 UUID from a fixed clock and random source', () => {
    const generator = new UuidV7Generator({
      now: () => Date.UTC(2026, 7, 20, 10, 0, 0),
      randomBytes: () => new Uint8Array(10).fill(0xab)
    });

    const id = generator.next();

    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('produces monotonically increasing ids across advancing timestamps', () => {
    let tick = Date.UTC(2026, 7, 20, 10, 0, 0);
    const generator = new UuidV7Generator({ now: () => tick });

    const first = generator.next();
    tick += 1;
    const second = generator.next();

    expect(first < second).toBe(true);
  });
});
