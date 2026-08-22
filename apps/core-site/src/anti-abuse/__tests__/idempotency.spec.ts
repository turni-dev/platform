import { describe, expect, it, vi } from 'vitest';
import { InMemoryIdempotencyKeyStore, runIdempotently, type IdempotencyGuard } from '../idempotency';

describe('runIdempotently', () => {
  it('performs the action and returns its result when the key is new', async () => {
    const guard: IdempotencyGuard<string> = {
      alreadyHandled: vi.fn().mockResolvedValue(false),
      isConcurrentDuplicate: vi.fn().mockReturnValue(false)
    };
    const perform = vi.fn().mockResolvedValue('done');

    const outcome = await runIdempotently('key-1', guard, perform);

    expect(perform).toHaveBeenCalledOnce();
    expect(outcome).toEqual({ kind: 'performed', result: 'done' });
  });

  it('skips performing the action when the key was already handled', async () => {
    const guard: IdempotencyGuard<string> = {
      alreadyHandled: vi.fn().mockResolvedValue(true),
      isConcurrentDuplicate: vi.fn().mockReturnValue(false)
    };
    const perform = vi.fn().mockResolvedValue('done');

    const outcome = await runIdempotently('key-1', guard, perform);

    expect(perform).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'duplicate' });
  });

  it('reports a duplicate when two attempts race past the pre-check', async () => {
    const guard: IdempotencyGuard<string> = {
      alreadyHandled: vi.fn().mockResolvedValue(false),
      isConcurrentDuplicate: vi.fn().mockResolvedValue(true)
    };
    const perform = vi.fn().mockResolvedValue('refused-as-duplicate');

    const outcome = await runIdempotently('key-1', guard, perform);

    expect(perform).toHaveBeenCalledOnce();
    expect(outcome).toEqual({ kind: 'duplicate' });
  });

  it('lets a genuine failure from perform propagate to the caller', async () => {
    const guard: IdempotencyGuard<string> = {
      alreadyHandled: vi.fn().mockResolvedValue(false),
      isConcurrentDuplicate: vi.fn().mockReturnValue(false)
    };
    const perform = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(runIdempotently('key-1', guard, perform)).rejects.toThrow('network down');
  });
});

describe('InMemoryIdempotencyKeyStore', () => {
  it('reports a key as unseen before it is remembered', () => {
    const store = new InMemoryIdempotencyKeyStore(60_000);

    expect(store.has('key-1')).toBe(false);
  });

  it('reports a remembered key as seen within the window', () => {
    const store = new InMemoryIdempotencyKeyStore(60_000);
    const now = 1_000;

    store.remember('key-1', now);

    expect(store.has('key-1', now + 1_000)).toBe(true);
  });

  it('forgets a key once its window has elapsed', () => {
    const store = new InMemoryIdempotencyKeyStore(60_000);
    const now = 1_000;

    store.remember('key-1', now);

    expect(store.has('key-1', now + 60_000)).toBe(false);
  });

  it('keeps keys independent of one another', () => {
    const store = new InMemoryIdempotencyKeyStore(60_000);

    store.remember('key-1', 0);

    expect(store.has('key-2', 0)).toBe(false);
  });
});
