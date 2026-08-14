import { OwnerAuthChallengeSchema, OwnerIdentitySchema } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import { AuthCookieName } from '../auth-cookies.js';
import { createHttpApp, type HttpAppOptions } from '../app.js';
import { ownerAuthCode, ownerAuthFixture, type OwnerAuthFixture } from './owner-auth-fixture.js';

const email = 'owner@turni.ru';
const origin = 'https://app.turni.ru';

function ownerAuthOptions(fixture: OwnerAuthFixture): HttpAppOptions {
  return {
    ownerAuth: {
      service: fixture.service,
      sessions: fixture.sessions,
      accessTokens: fixture.accessTokens,
      owners: fixture.owners,
      secureCookies: true,
      allowedOrigins: [origin]
    }
  };
}

function setCookies(headers: Readonly<Record<string, unknown>>): readonly string[] {
  const header = headers['set-cookie'];
  if (header === undefined) {
    return [];
  }

  return Array.isArray(header)
    ? (header as string[])
    : typeof header === 'string'
      ? [header]
      : [];
}

function cookieValue(headers: Readonly<Record<string, unknown>>, name: string): string {
  const cookie = setCookies(headers).find((candidate) =>
    candidate.startsWith(`${name}=`)
  );
  const value = cookie?.slice(name.length + 1).split(';')[0];

  return value ?? '';
}

async function signedIn(
  fixture: OwnerAuthFixture
): Promise<{ access: string; refresh: string }> {
  const app = await createHttpApp(ownerAuthOptions(fixture));
  try {
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register/request',
      payload: { email }
    });
    const verified = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register/verify',
      payload: { email, code: ownerAuthCode }
    });

    return {
      access: cookieValue(verified.headers, AuthCookieName.Access),
      refresh: cookieValue(verified.headers, AuthCookieName.Refresh)
    };
  } finally {
    await app.close();
  }
}

describe('owner auth HTTP surface', () => {
  it('stays unmounted until the owner auth stack is composed', async () => {
    const app = await createHttpApp();
    try {
      await expect(
        app.inject({ method: 'POST', url: '/api/v1/auth/register/request', payload: { email } })
      ).resolves.toMatchObject({ statusCode: 404 });
    } finally {
      await app.close();
    }
  });

  it('accepts a code request without ever returning the code', async () => {
    const fixture = ownerAuthFixture();
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/request',
        payload: { email }
      });

      expect(response.statusCode).toBe(202);
      expect(OwnerAuthChallengeSchema.parse(response.json())).toMatchObject({
        resendAfterSeconds: 60
      });
      expect(response.body).not.toContain(ownerAuthCode);
      expect(fixture.notifier.sent).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('rejects a malformed email at the boundary', async () => {
    const app = await createHttpApp(ownerAuthOptions(ownerAuthFixture()));
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/request',
        payload: { email: 'not-an-email' }
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ status: 400 });
    } finally {
      await app.close();
    }
  });

  it('reports an unexpected failure as a server error instead of blaming the request', async () => {
    const fixture = ownerAuthFixture();
    const options = ownerAuthOptions(fixture);
    const failing: HttpAppOptions = {
      ownerAuth: {
        ...options.ownerAuth!,
        service: Object.assign(Object.create(fixture.service) as typeof fixture.service, {
          requestCode: (): Promise<never> =>
            Promise.reject(new Error('permission denied for table auth_codes'))
        })
      }
    };
    const app = await createHttpApp(failing);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/request',
        payload: { email }
      });

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('auth_codes');
    } finally {
      await app.close();
    }
  });

  it('answers a repeated request with a retry hint instead of a second code', async () => {
    const fixture = ownerAuthFixture();
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login/request',
        payload: { email }
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login/request',
        payload: { email }
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
      expect(fixture.notifier.sent).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('turns a verified code into an identity and two scoped cookies', async () => {
    const fixture = ownerAuthFixture();
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/request',
        payload: { email }
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/verify',
        payload: { email, code: ownerAuthCode }
      });

      expect(response.statusCode).toBe(200);
      expect(OwnerIdentitySchema.parse(response.json())).toMatchObject({
        email,
        role: 'owner'
      });
      const cookies = setCookies(response.headers);
      expect(cookies.every((cookie) => cookie.includes('HttpOnly; Secure'))).toBe(true);
      expect(
        cookies.find((cookie) => cookie.startsWith(`${AuthCookieName.Refresh}=`))
      ).toContain('Path=/api/v1/auth');
      expect(response.body).not.toContain(ownerAuthCode);
    } finally {
      await app.close();
    }
  });

  it('refuses a wrong code without cookies and without a reason', async () => {
    const fixture = ownerAuthFixture();
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/request',
        payload: { email }
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register/verify',
        payload: { email, code: '000000' }
      });

      expect(response.statusCode).toBe(401);
      expect(setCookies(response.headers)).toEqual([]);
      expect(JSON.stringify(response.json())).not.toContain('code');
    } finally {
      await app.close();
    }
  });

  it('signs a known owner in through the login alias without a second tenant', async () => {
    const fixture = ownerAuthFixture();
    await signedIn(fixture);
    fixture.advanceBy(60_000);
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login/request',
        payload: { email }
      });
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login/verify',
        payload: { email, code: ownerAuthCode }
      });

      expect(response.statusCode).toBe(200);
      expect(fixture.owners.registrations).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});

describe('owner identity endpoint', () => {
  it('answers an authenticated owner with the contract identity', async () => {
    const fixture = ownerAuthFixture();
    const cookies = await signedIn(fixture);
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: `${AuthCookieName.Access}=${cookies.access}` }
      });

      expect(response.statusCode).toBe(200);
      expect(OwnerIdentitySchema.parse(response.json()).email).toBe(email);
    } finally {
      await app.close();
    }
  });

  it('denies a missing or forged access token', async () => {
    const app = await createHttpApp(ownerAuthOptions(ownerAuthFixture()));
    try {
      await expect(
        app.inject({ method: 'GET', url: '/api/v1/auth/me' })
      ).resolves.toMatchObject({ statusCode: 401 });
      await expect(
        app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          headers: { cookie: `${AuthCookieName.Access}=a.b.c` }
        })
      ).resolves.toMatchObject({ statusCode: 401 });
    } finally {
      await app.close();
    }
  });
});

describe('owner session lifecycle', () => {
  it('rotates the refresh credential and rejects the replayed predecessor', async () => {
    const fixture = ownerAuthFixture();
    const cookies = await signedIn(fixture);
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      const rotated = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: {
          origin,
          cookie: `${AuthCookieName.Refresh}=${cookies.refresh}`
        }
      });

      expect(rotated.statusCode).toBe(204);
      const successor = cookieValue(rotated.headers, AuthCookieName.Refresh);
      expect(successor).not.toBe(cookies.refresh);

      const replayed = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: {
          origin,
          cookie: `${AuthCookieName.Refresh}=${cookies.refresh}`
        }
      });
      expect(replayed.statusCode).toBe(401);
      expect(
        setCookies(replayed.headers).every((cookie) => cookie.includes('Max-Age=0'))
      ).toBe(true);
    } finally {
      await app.close();
    }
  });

  it('refuses a cookie-authenticated mutation from an untrusted origin', async () => {
    const fixture = ownerAuthFixture();
    const cookies = await signedIn(fixture);
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        headers: {
          origin: 'https://evil.example',
          cookie: `${AuthCookieName.Refresh}=${cookies.refresh}`
        }
      });

      expect(response.statusCode).toBe(403);
      expect(fixture.sessionStore.rows).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('logs out by revoking the session and clearing both cookies', async () => {
    const fixture = ownerAuthFixture();
    const cookies = await signedIn(fixture);
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          origin,
          cookie: `${AuthCookieName.Refresh}=${cookies.refresh}`
        }
      });

      expect(response.statusCode).toBe(204);
      expect(setCookies(response.headers)).toHaveLength(2);
      expect(fixture.sessionStore.rows).toHaveLength(0);

      await expect(
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/refresh',
          headers: { origin, cookie: `${AuthCookieName.Refresh}=${cookies.refresh}` }
        })
      ).resolves.toMatchObject({ statusCode: 401 });
    } finally {
      await app.close();
    }
  });

  it('records the whole browser path as analytics events', async () => {
    const fixture = ownerAuthFixture();
    const cookies = await signedIn(fixture);
    const app = await createHttpApp(ownerAuthOptions(fixture));
    try {
      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          origin,
          cookie: `${AuthCookieName.Refresh}=${cookies.refresh}`
        }
      });

      expect(fixture.events.publishedEvents.map((event) => event.name)).toEqual([
        'owner.registered',
        'owner.signed_in',
        'owner.signed_out'
      ]);
      expect(JSON.stringify(fixture.events.publishedEvents)).not.toContain(email);
    } finally {
      await app.close();
    }
  });

  it('treats a logout without a session as already logged out', async () => {
    const app = await createHttpApp(ownerAuthOptions(ownerAuthFixture()));
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: { origin }
      });

      expect(response.statusCode).toBe(204);
      expect(setCookies(response.headers)).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
