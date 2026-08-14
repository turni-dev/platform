import { describe, expect, it } from 'vitest';
import { InMemoryKeyValueCache } from '../in-memory-key-value-cache.js';

describe('InMemoryKeyValueCache', () => {
  it('reserves a key only once until its ttl expires', async () => {
    let now = new Date('2026-08-14T10:00:00.000Z').getTime();
    const cache = new InMemoryKeyValueCache(() => now);

    await expect(cache.setIfAbsent('cooldown', 60_000)).resolves.toBe(true);
    await expect(cache.setIfAbsent('cooldown', 60_000)).resolves.toBe(false);
    await expect(cache.pttl('cooldown')).resolves.toBe(60_000);

    now += 60_000;
    await expect(cache.setIfAbsent('cooldown', 60_000)).resolves.toBe(true);
  });

  it('counts hits inside a window and restarts after it', async () => {
    let now = new Date('2026-08-14T10:00:00.000Z').getTime();
    const cache = new InMemoryKeyValueCache(() => now);

    await expect(cache.incrementWithin('quota', 900_000)).resolves.toBe(1);
    await expect(cache.incrementWithin('quota', 900_000)).resolves.toBe(2);

    now += 900_000;
    await expect(cache.incrementWithin('quota', 900_000)).resolves.toBe(1);
  });

  it('reports no ttl for an unknown key', async () => {
    const cache = new InMemoryKeyValueCache(() => 0);

    await expect(cache.pttl('missing')).resolves.toBe(-1);
  });
});
