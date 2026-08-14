import { describe, expect, it } from 'vitest';
import {
  fetchOwnerIdentity,
  requestOwnerCode,
  signOutOwner,
  verifyOwnerCode
} from '../owner-auth-client';

const identity = {
  userId: '01900000-0000-7000-8000-000000000001',
  tenantId: '01900000-0000-7000-8000-000000000002',
  tenantName: 'Кафе Пример',
  email: 'owner@turni.ru',
  role: 'owner'
};

const challenge = {
  challengeId: '01900000-0000-7000-8000-000000000003',
  expiresAt: '2026-08-14T10:05:00.000Z',
  resendAfterSeconds: 60
};

function respondWith(
  status: number,
  body: unknown,
  calls: { url: string; init?: RequestInit }[] = []
): typeof fetch {
  return ((url: string, init?: RequestInit) => {
    calls.push({ url, ...(init === undefined ? {} : { init }) });

    return Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), { status })
    );
  }) as unknown as typeof fetch;
}

describe('requestOwnerCode', () => {
  it('posts the email to the flow endpoint and returns the challenge', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];

    await expect(
      requestOwnerCode('register', ' Owner@Turni.RU ', {
        fetch: respondWith(202, challenge, calls)
      })
    ).resolves.toEqual({ status: 'ok', value: challenge });

    expect(calls[0]?.url).toBe('/api/v1/auth/register/request');
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ email: 'owner@turni.ru' }));
    expect(calls[0]?.init?.credentials).toBe('same-origin');
  });

  it('reports a malformed email without calling the backend', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];

    await expect(
      requestOwnerCode('login', 'not-an-email', {
        fetch: respondWith(202, challenge, calls)
      })
    ).resolves.toEqual({ status: 'error', code: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('maps the backend refusals to generic outcomes', async () => {
    await expect(
      requestOwnerCode('login', 'owner@turni.ru', {
        fetch: respondWith(429, { status: 429 })
      })
    ).resolves.toEqual({ status: 'error', code: 'rate_limited' });

    await expect(
      requestOwnerCode('login', 'owner@turni.ru', {
        fetch: respondWith(503, { status: 503 })
      })
    ).resolves.toEqual({ status: 'error', code: 'unavailable' });
  });

  it('treats an unreachable backend as unavailable', async () => {
    await expect(
      requestOwnerCode('login', 'owner@turni.ru', {
        fetch: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
      })
    ).resolves.toEqual({ status: 'error', code: 'unavailable' });
  });
});

describe('verifyOwnerCode', () => {
  it('returns the identity a verified code unlocks', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];

    await expect(
      verifyOwnerCode('register', 'owner@turni.ru', '424242', {
        fetch: respondWith(200, identity, calls)
      })
    ).resolves.toEqual({ status: 'ok', value: identity });
    expect(calls[0]?.url).toBe('/api/v1/auth/register/verify');
  });

  it('refuses a code that is not six digits before sending it', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];

    await expect(
      verifyOwnerCode('login', 'owner@turni.ru', '42', {
        fetch: respondWith(200, identity, calls)
      })
    ).resolves.toEqual({ status: 'error', code: 'invalid' });
    expect(calls).toHaveLength(0);
  });

  it('reports a rejected code without a reason', async () => {
    await expect(
      verifyOwnerCode('login', 'owner@turni.ru', '000000', {
        fetch: respondWith(401, { status: 401 })
      })
    ).resolves.toEqual({ status: 'error', code: 'unauthorized' });
  });

  it('rejects a response that does not match the identity contract', async () => {
    await expect(
      verifyOwnerCode('login', 'owner@turni.ru', '424242', {
        fetch: respondWith(200, { ...identity, role: 'staff' })
      })
    ).resolves.toEqual({ status: 'error', code: 'unavailable' });
  });
});

describe('signOutOwner', () => {
  it('posts the logout with the cookies the browser holds', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];

    await expect(signOutOwner({ fetch: respondWith(204, undefined, calls) })).resolves.toBe(
      true
    );

    expect(calls[0]?.url).toBe('/api/v1/auth/logout');
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.credentials).toBe('same-origin');
  });

  it('never fails the caller when the backend is unreachable', async () => {
    await expect(
      signOutOwner({
        fetch: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch
      })
    ).resolves.toBe(false);
  });

  it('reports a refused logout, because that session is still alive', async () => {
    await expect(signOutOwner({ fetch: respondWith(403, undefined) })).resolves.toBe(false);
  });
});

describe('fetchOwnerIdentity', () => {
  it('returns the identity of a live session', async () => {
    await expect(
      fetchOwnerIdentity({ fetch: respondWith(200, identity) })
    ).resolves.toEqual(identity);
  });

  it('returns nothing when the session is gone', async () => {
    await expect(
      fetchOwnerIdentity({ fetch: respondWith(401, { status: 401 }) })
    ).resolves.toBeUndefined();
  });

  it('forwards the caller cookies when asked to', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];

    await fetchOwnerIdentity({
      fetch: respondWith(200, identity, calls),
      baseUrl: 'http://backend:3000',
      cookie: 'turni_access=token'
    });

    expect(calls[0]?.url).toBe('http://backend:3000/api/v1/auth/me');
    expect(calls[0]?.init?.headers).toEqual({ cookie: 'turni_access=token' });
  });
});
