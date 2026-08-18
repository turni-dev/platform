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
