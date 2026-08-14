import { describe, expect, it } from 'vitest';
import {
  AuthCookieName,
  authCookieOptions,
  clearedAuthCookies,
  issuedAuthCookies,
  isTrustedOrigin,
  readCookie
} from '../auth-cookies.js';

const now = new Date('2026-08-14T10:00:00.000Z');
const session = {
  accessToken: 'header.payload.signature',
  refreshCredential: 'hint.secret.signature',
  idleExpiresAt: new Date(now.getTime() + 3_600_000)
};

describe('issuedAuthCookies', () => {
  it('scopes the refresh credential to the auth path and hides it from scripts', () => {
    const cookies = issuedAuthCookies(session, authCookieOptions({ secure: true }), now);

    const refresh = cookies.find((cookie) =>
      cookie.startsWith(`${AuthCookieName.Refresh}=`)
    );
    expect(refresh).toBe(
      `${AuthCookieName.Refresh}=hint.secret.signature; Path=/api/v1/auth; ` +
        'Max-Age=3600; HttpOnly; Secure; SameSite=Strict'
    );
  });

  it('keeps the access token readable across the whole site but not by scripts', () => {
    // The cabinet renders on the server, which reads the request cookies of a
    // page load: a token scoped to /api/v1 would never reach it.
    const cookies = issuedAuthCookies(session, authCookieOptions({ secure: true }), now);

    expect(cookies.find((cookie) => cookie.startsWith(`${AuthCookieName.Access}=`))).toBe(
      `${AuthCookieName.Access}=header.payload.signature; Path=/; ` +
        'Max-Age=600; HttpOnly; Secure; SameSite=Strict'
    );
  });

  it('drops the Secure attribute only when explicitly running without TLS', () => {
    const cookies = issuedAuthCookies(session, authCookieOptions({ secure: false }), now);

    expect(cookies.every((cookie) => !cookie.includes('Secure'))).toBe(true);
    expect(cookies.every((cookie) => cookie.includes('HttpOnly'))).toBe(true);
  });

  it('never emits an expired refresh cookie for an already idle session', () => {
    const cookies = issuedAuthCookies(
      { ...session, idleExpiresAt: new Date(now.getTime() - 1_000) },
      authCookieOptions({ secure: true }),
      now
    );

    expect(cookies.find((cookie) => cookie.startsWith(`${AuthCookieName.Refresh}=`))).toContain(
      'Max-Age=0'
    );
  });

  it('refuses a credential that would break the cookie header', () => {
    expect(() =>
      issuedAuthCookies(
        { ...session, refreshCredential: 'bad;value' },
        authCookieOptions({ secure: true }),
        now
      )
    ).toThrow('Invalid cookie value');
  });
});

describe('clearedAuthCookies', () => {
  it('expires both cookies on their own paths', () => {
    expect(clearedAuthCookies(authCookieOptions({ secure: true }))).toEqual([
      `${AuthCookieName.Access}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      `${AuthCookieName.Refresh}=; Path=/api/v1/auth; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
    ]);
  });
});

describe('readCookie', () => {
  it('reads a value out of a cookie header', () => {
    expect(readCookie('a=1; turni_refresh=hint.secret.sig; b=2', 'turni_refresh')).toBe(
      'hint.secret.sig'
    );
  });

  it('returns undefined for a missing header or name', () => {
    expect(readCookie(undefined, 'turni_refresh')).toBeUndefined();
    expect(readCookie('a=1', 'turni_refresh')).toBeUndefined();
  });

  it('does not confuse a name suffix with the name', () => {
    expect(readCookie('other_turni_refresh=nope', 'turni_refresh')).toBeUndefined();
  });
});

describe('isTrustedOrigin', () => {
  const allowed = ['https://app.turni.ru'];

  it('accepts an allowed origin', () => {
    expect(isTrustedOrigin({ origin: 'https://app.turni.ru', allowedOrigins: allowed })).toBe(
      true
    );
  });

  it('rejects a foreign origin', () => {
    expect(isTrustedOrigin({ origin: 'https://evil.example', allowedOrigins: allowed })).toBe(
      false
    );
  });

  it('rejects a request that carries no origin at all', () => {
    expect(isTrustedOrigin({ allowedOrigins: allowed })).toBe(false);
  });

  it('falls back to the Referer origin when Origin is absent', () => {
    expect(
      isTrustedOrigin({ referer: 'https://app.turni.ru/dashboard', allowedOrigins: allowed })
    ).toBe(true);
    expect(
      isTrustedOrigin({ referer: 'https://evil.example/dashboard', allowedOrigins: allowed })
    ).toBe(false);
  });

  it('rejects every request when no origin is allowed', () => {
    expect(isTrustedOrigin({ origin: 'https://app.turni.ru', allowedOrigins: [] })).toBe(false);
  });
});
