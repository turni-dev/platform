/**
 * Ephemeral counters and reservations only. A cache entry is never the source
 * of truth for a session, a tenant membership or an authorization decision;
 * callers must fail closed when it is unavailable.
 */
export interface KeyValueCachePort {
  /** Reserves a key for `ttlMs`; false when it is already held. */
  setIfAbsent(key: string, ttlMs: number): Promise<boolean>;
  /** Remaining lifetime in milliseconds, or -1 when the key is absent. */
  pttl(key: string): Promise<number>;
  /** Increments a counter that expires `windowMs` after its first hit. */
  incrementWithin(key: string, windowMs: number): Promise<number>;
}
