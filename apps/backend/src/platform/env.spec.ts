import { afterEach, describe, expect, it, vi } from 'vitest';
import { readHttpEnv } from './env.js';

describe('readHttpEnv', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses safe HTTP defaults when variables are absent', () => {
    vi.stubEnv('HTTP_HOST', '');
    vi.stubEnv('HTTP_PORT', '');

    delete process.env['HTTP_HOST'];
    delete process.env['HTTP_PORT'];

    expect(
      readHttpEnv({
        DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
        WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
        WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac'
      })
    ).toEqual({
      HTTP_HOST: '0.0.0.0',
      HTTP_PORT: 3000,
      DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
      WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
      WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac'
    });
  });

  it('coerces a valid explicit port', () => {
    expect(
      readHttpEnv({
        HTTP_HOST: '127.0.0.1',
        HTTP_PORT: '8080',
        DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
        WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
        WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac'
      })
    ).toEqual({
      HTTP_HOST: '127.0.0.1',
      HTTP_PORT: 8080,
      DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
      WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
      WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac'
    });
  });

  it('rejects a missing guest session secret', () => {
    expect(() => readHttpEnv({ HTTP_PORT: '8080' })).toThrow();
  });

  it('rejects an out-of-range port', () => {
    expect(() =>
      readHttpEnv({
        HTTP_PORT: '65536',
        DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
        WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
        WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac'
      })
    ).toThrow();
  });

  it('requires a database URL and distinct 32-byte widget secrets', () => {
    const secret = 'test-session-secret-that-is-long-enough-for-hmac';

    expect(() => readHttpEnv({ WIDGET_SESSION_SECRET: secret, WIDGET_ROUTING_SECRET: secret })).toThrow();
    expect(() => readHttpEnv({
      DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
      WIDGET_SESSION_SECRET: secret,
      WIDGET_ROUTING_SECRET: secret
    })).toThrow();
  });
});
