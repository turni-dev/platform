import { describe, expect, it } from 'vitest';
import { InMemoryKeyValueCache } from '../../../../platform/cache/in-memory-key-value-cache.js';
import type { KeyValueCachePort } from '../../../../platform/cache/key-value-cache.port.js';
import {
  OwnerAuthThrottle,
  ownerAuthResendCooldownMs,
  ownerAuthWindowMs,
  maxOwnerAuthRequestsPerEmail,
  maxOwnerAuthRequestsPerIp
} from '../owner-auth-throttle.js';

const email = 'owner@turni.ru';
const ip = '203.0.113.10';
const secret = 'owner-auth-secret-with-at-least-thirty-two-characters';

function throttleAt(startedAt: string): {
  readonly throttle: OwnerAuthThrottle;
  readonly cache: InMemoryKeyValueCache;
  advance(ms: number): void;
  now(): Date;
} {
  let clock = new Date(startedAt).getTime();
  const cache = new InMemoryKeyValueCache(() => clock);

  return {
    cache,
    throttle: new OwnerAuthThrottle(cache, secret),
    advance: (ms) => {
      clock += ms;
    },
    now: () => new Date(clock)
  };
}

describe('OwnerAuthThrottle', () => {
  it('allows a first request and holds the resend cooldown', async () => {
    const context = throttleAt('2026-08-14T10:00:00.000Z');

    await expect(
      context.throttle.requestCode({ email, ip, now: context.now() })
    ).resolves.toEqual({
      allowed: true,
      resendAfterSeconds: ownerAuthResendCooldownMs / 1_000
    });
    await expect(
      context.throttle.requestCode({ email, ip, now: context.now() })
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: ownerAuthResendCooldownMs / 1_000
    });

    context.advance(ownerAuthResendCooldownMs);
    await expect(
      context.throttle.requestCode({ email, ip, now: context.now() })
    ).resolves.toEqual({
      allowed: true,
      resendAfterSeconds: ownerAuthResendCooldownMs / 1_000
    });
  });

  it('denies further codes once the email window quota is spent', async () => {
    const context = throttleAt('2026-08-14T10:00:00.000Z');

    for (let sent = 0; sent < maxOwnerAuthRequestsPerEmail; sent += 1) {
      await expect(
        context.throttle.requestCode({ email, ip, now: context.now() })
      ).resolves.toMatchObject({ allowed: true });
      context.advance(ownerAuthResendCooldownMs);
    }

    await expect(
      context.throttle.requestCode({ email, ip, now: context.now() })
    ).resolves.toMatchObject({ allowed: false });
  });

  it('denies a shared address that exceeds the ip window quota', async () => {
    const context = throttleAt('2026-08-14T10:00:00.000Z');

    for (let sent = 0; sent < maxOwnerAuthRequestsPerIp; sent += 1) {
      await expect(
        context.throttle.requestCode({ email: `owner${sent}@turni.ru`, ip, now: context.now() })
      ).resolves.toMatchObject({ allowed: true });
    }

    await expect(
      context.throttle.requestCode({ email: 'another@turni.ru', ip, now: context.now() })
    ).resolves.toMatchObject({ allowed: false });

    context.advance(ownerAuthWindowMs);
    await expect(
      context.throttle.requestCode({ email: 'another@turni.ru', ip, now: context.now() })
    ).resolves.toMatchObject({ allowed: true });
  });

  it('keeps the raw email and address out of cache keys', async () => {
    const context = throttleAt('2026-08-14T10:00:00.000Z');

    await context.throttle.requestCode({ email, ip, now: context.now() });

    const keys = context.cache.keys().join(' ');
    expect(keys).not.toContain(email);
    expect(keys).not.toContain(ip);
    expect(keys).toContain('owner-auth');
  });

  it('fails closed when the cache is unavailable', async () => {
    const unavailable: KeyValueCachePort = {
      setIfAbsent: () => Promise.reject(new Error('redis down')),
      pttl: () => Promise.reject(new Error('redis down')),
      incrementWithin: () => Promise.reject(new Error('redis down'))
    };
    const throttle = new OwnerAuthThrottle(unavailable, secret);

    await expect(
      throttle.requestCode({ email, ip, now: new Date('2026-08-14T10:00:00.000Z') })
    ).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: ownerAuthResendCooldownMs / 1_000
    });
  });
});
