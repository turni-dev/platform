import type { KeyValueCachePort } from './key-value-cache.port.js';

interface CacheEntry {
  readonly expiresAt: number;
  count: number;
}

/**
 * Local and test adapter for {@link KeyValueCachePort}. It holds no data across
 * processes, so it never substitutes for durable storage.
 */
export class InMemoryKeyValueCache implements KeyValueCachePort {
  private readonly entries = new Map<string, CacheEntry>();

  public constructor(private readonly clock: () => number = () => Date.now()) {}

  public setIfAbsent(key: string, ttlMs: number): Promise<boolean> {
    if (this.live(key) !== undefined) {
      return Promise.resolve(false);
    }

    this.entries.set(key, { expiresAt: this.clock() + ttlMs, count: 1 });
    return Promise.resolve(true);
  }

  public pttl(key: string): Promise<number> {
    const entry = this.live(key);

    return Promise.resolve(entry === undefined ? -1 : entry.expiresAt - this.clock());
  }

  public incrementWithin(key: string, windowMs: number): Promise<number> {
    const entry = this.live(key);
    if (entry === undefined) {
      this.entries.set(key, { expiresAt: this.clock() + windowMs, count: 1 });
      return Promise.resolve(1);
    }

    entry.count += 1;
    return Promise.resolve(entry.count);
  }

  public keys(): readonly string[] {
    return [...this.entries.keys()];
  }

  private live(key: string): CacheEntry | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (entry.expiresAt <= this.clock()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry;
  }
}
