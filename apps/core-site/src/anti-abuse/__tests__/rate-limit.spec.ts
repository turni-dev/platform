import { describe, expect, it } from 'vitest';
import { InMemoryRateLimiter, decideRateLimit } from '../rate-limit';

describe('InMemoryRateLimiter', () => {
  it('allows requests under the limit', () => {
    const limiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 3 });

    expect(limiter.consume('a', 0).allowed).toBe(true);
    expect(limiter.consume('a', 0).allowed).toBe(true);
    expect(limiter.consume('a', 0).allowed).toBe(true);
  });

  it('blocks once the limit is reached within the window', () => {
    const limiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 2 });

    limiter.consume('a', 0);
    limiter.consume('a', 0);
    const decision = limiter.consume('a', 0);

    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets the count once the window has passed', () => {
    const limiter = new InMemoryRateLimiter({ windowMs: 1_000, max: 1 });

    limiter.consume('a', 0);
    expect(limiter.consume('a', 500).allowed).toBe(false);
    expect(limiter.consume('a', 1_500).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = new InMemoryRateLimiter({ windowMs: 60_000, max: 1 });

    limiter.consume('a', 0);

    expect(limiter.consume('b', 0).allowed).toBe(true);
    expect(limiter.consume('a', 0).allowed).toBe(false);
  });
});

describe('decideRateLimit', () => {
  it('allows when both the ip and session limiters allow', () => {
    const ip = new InMemoryRateLimiter({ windowMs: 60_000, max: 5 });
    const session = new InMemoryRateLimiter({ windowMs: 60_000, max: 5 });

    const decision = decideRateLimit(
      { ip, session },
      { formName: 'lead', ip: '1.2.3.4', sessionId: 's-1' },
      0
    );

    expect(decision.allowed).toBe(true);
  });

  it('blocks when the ip limiter is exhausted, even if the session limiter allows', () => {
    const ip = new InMemoryRateLimiter({ windowMs: 60_000, max: 1 });
    const session = new InMemoryRateLimiter({ windowMs: 60_000, max: 5 });

    decideRateLimit({ ip, session }, { formName: 'lead', ip: '1.2.3.4', sessionId: 's-1' }, 0);
    const decision = decideRateLimit(
      { ip, session },
      { formName: 'lead', ip: '1.2.3.4', sessionId: 's-2' },
      0
    );

    expect(decision.allowed).toBe(false);
  });

  it('blocks when the session limiter is exhausted, even if the ip limiter allows', () => {
    const ip = new InMemoryRateLimiter({ windowMs: 60_000, max: 5 });
    const session = new InMemoryRateLimiter({ windowMs: 60_000, max: 1 });

    decideRateLimit({ ip, session }, { formName: 'lead', ip: '1.2.3.4', sessionId: 's-1' }, 0);
    const decision = decideRateLimit(
      { ip, session },
      { formName: 'lead', ip: '5.6.7.8', sessionId: 's-1' },
      0
    );

    expect(decision.allowed).toBe(false);
  });

  it('keeps forms independent by prefixing the counter key with the form name', () => {
    const ip = new InMemoryRateLimiter({ windowMs: 60_000, max: 1 });
    const session = new InMemoryRateLimiter({ windowMs: 60_000, max: 1 });

    decideRateLimit({ ip, session }, { formName: 'lead', ip: '1.2.3.4', sessionId: 's-1' }, 0);
    const decision = decideRateLimit(
      { ip, session },
      { formName: 'feedback', ip: '1.2.3.4', sessionId: 's-1' },
      0
    );

    expect(decision.allowed).toBe(true);
  });
});
