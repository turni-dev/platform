export interface IdempotencyKeyStore {
  has(key: string): boolean;
  remember(key: string): void;
}

/**
 * Process-local record of idempotency keys that already produced a stored
 * result. Deliberately in-memory, not a CMS read: the CMS-facing token used
 * for this form is write-only (create only, no find/findOne on its own
 * records — see `../../apps/cms/README.md`), so the duplicate pre-check
 * cannot be backed by asking the CMS "have I seen this key before". The real
 * safety net against a genuine race between two concurrent submissions is
 * the CMS unique-index violation surfaced through `isConcurrentDuplicate`;
 * this store only short-circuits the common case of the same visitor
 * resubmitting (double-click, retried fetch) without a second round trip.
 *
 * Same honest limitation as `InMemoryRateLimiter` in `./rate-limit.ts`: this
 * counts only within the Node process that holds it. A multi-instance
 * deployment gets one independent store per instance, so a resubmission
 * routed to a different instance still reaches the CMS — which is fine,
 * because the unique-index check still catches it there.
 */
export class InMemoryIdempotencyKeyStore implements IdempotencyKeyStore {
  private readonly seenUntil = new Map<string, number>();

  constructor(private readonly windowMs: number) {}

  has(key: string, now: number = Date.now()): boolean {
    this.sweep(now);

    const expiresAt = this.seenUntil.get(key);

    return expiresAt !== undefined && expiresAt > now;
  }

  remember(key: string, now: number = Date.now()): void {
    this.seenUntil.set(key, now + this.windowMs);
  }

  /** Drops expired entries so the map does not grow without bound. */
  private sweep(now: number): void {
    for (const [key, expiresAt] of this.seenUntil) {
      if (expiresAt <= now) {
        this.seenUntil.delete(key);
      }
    }
  }
}

/**
 * Backs the idempotency check with whatever store the form's write actually
 * goes through (CMS, another API, ...). This layer only orchestrates the
 * two checks every idempotent POST needs; it never talks to a store itself.
 */
export interface IdempotencyGuard<TResult> {
  /** True when this key already has a stored result from a previous attempt. */
  alreadyHandled(key: string): Promise<boolean>;
  /**
   * True when `perform` itself discovered, at write time, that another
   * concurrent attempt with the same key won the race (e.g. a unique-index
   * violation). This is the second line of defence for two submissions that
   * both pass `alreadyHandled` before either has written anything.
   */
  isConcurrentDuplicate(result: TResult): Promise<boolean> | boolean;
}

export type IdempotentOutcome<TResult> =
  | { readonly kind: 'duplicate' }
  | { readonly kind: 'performed'; readonly result: TResult };

/**
 * Runs `perform` at most once per idempotency key: skips it entirely when
 * the key was already handled, and folds a same-key write race into the
 * same "duplicate" outcome the caller already has to handle. A caller
 * answers a duplicate exactly like a fresh success — this module makes that
 * one check reusable instead of copy-pasted into every form handler.
 */
export async function runIdempotently<TResult>(
  key: string,
  guard: IdempotencyGuard<TResult>,
  perform: () => Promise<TResult>
): Promise<IdempotentOutcome<TResult>> {
  if (await guard.alreadyHandled(key)) {
    return { kind: 'duplicate' };
  }

  const result = await perform();
  if (await guard.isConcurrentDuplicate(result)) {
    return { kind: 'duplicate' };
  }

  return { kind: 'performed', result };
}
