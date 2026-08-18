import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME, getClientIp, resolveRequestIdentity } from '../identity';

describe('getClientIp', () => {
  it('reads the first address from x-forwarded-for', () => {
    const request = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }
    });

    expect(getClientIp(request)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const request = new Request('http://localhost/', { headers: { 'x-real-ip': '203.0.113.9' } });

    expect(getClientIp(request)).toBe('203.0.113.9');
  });

  it('falls back to "unknown" when no ip header is present', () => {
    const request = new Request('http://localhost/');

    expect(getClientIp(request)).toBe('unknown');
  });
});

describe('resolveRequestIdentity', () => {
  it('reuses the session id already carried in the cookie', () => {
    const request = new Request('http://localhost/', {
      headers: { cookie: `${SESSION_COOKIE_NAME}=existing-session; other=1` }
    });

    const identity = resolveRequestIdentity(request);

    expect(identity.sessionId).toBe('existing-session');
    expect(identity.setCookie).toBeUndefined();
  });

  it('mints a fresh session id and asks the caller to set it when there is no cookie', () => {
    const request = new Request('http://localhost/');

    const identity = resolveRequestIdentity(request);

    expect(identity.sessionId.length).toBeGreaterThan(0);
    expect(identity.setCookie).toContain(`${SESSION_COOKIE_NAME}=${identity.sessionId}`);
  });

  it('mints two different session ids for two requests with no cookie', () => {
    const first = resolveRequestIdentity(new Request('http://localhost/'));
    const second = resolveRequestIdentity(new Request('http://localhost/'));

    expect(first.sessionId).not.toBe(second.sessionId);
  });
});
