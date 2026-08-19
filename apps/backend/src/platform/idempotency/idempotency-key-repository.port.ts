/** The stored outcome of a request that carried an `Idempotency-Key`. */
export interface IdempotencyKeyFound {
  readonly requestHash: string;
  readonly statusCode: number;
  readonly response: unknown;
}

export interface StoreIdempotencyKeyInput {
  readonly tenantId: string;
  readonly key: string;
  readonly requestHash: string;
  readonly statusCode: number;
  readonly response: unknown;
  readonly ttlSeconds: number;
}

/**
 * Backs the `Idempotency-Key` contract: a caller-supplied key that maps to at
 * most one stored outcome per tenant, for a bounded time.
 */
export interface IdempotencyKeyRepositoryPort {
  find(
    input: Readonly<{ tenantId: string; key: string }>
  ): Promise<IdempotencyKeyFound | undefined>;

  /**
   * Insert-only. When a concurrent attempt already inserted the same `key`,
   * this resolves without error — the loser simply reads back the winner's
   * row through a later {@link find}.
   */
  store(input: StoreIdempotencyKeyInput): Promise<void>;
}
