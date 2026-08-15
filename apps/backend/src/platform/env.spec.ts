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
        WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac',
        OWNER_AUTH_SECRET: 'test-owner-auth-secret-that-is-long-enough!!',
        WEBHOOK_ROUTING_SECRET: 'test-webhook-routing-secret-long-enough!!',
        PUBLIC_WEBHOOK_ORIGIN: 'https://hooks.turni.test',
        SMTP_HOST: 'smtp.turni.ru',
        SMTP_USER: 'no-reply@turni.ru',
        SMTP_PASSWORD: 'smtp-password',
        EMAIL_FROM: 'Turni <no-reply@turni.ru>',
        APP_ORIGIN: 'https://app.turni.ru'
      })
    ).toEqual({
      HTTP_HOST: '0.0.0.0',
      HTTP_PORT: 3000,
      DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
      WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
      WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac',
      OWNER_AUTH_SECRET: 'test-owner-auth-secret-that-is-long-enough!!',
      WEBHOOK_ROUTING_SECRET: 'test-webhook-routing-secret-long-enough!!',
      PUBLIC_WEBHOOK_ORIGIN: 'https://hooks.turni.test',
      SMTP_HOST: 'smtp.turni.ru',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_USER: 'no-reply@turni.ru',
      SMTP_PASSWORD: 'smtp-password',
      EMAIL_FROM: 'Turni <no-reply@turni.ru>',
      APP_ORIGIN: 'https://app.turni.ru',
      AUTH_COOKIE_SECURE: true
    });
  });

  it('coerces a valid explicit port', () => {
    expect(
      readHttpEnv({
        HTTP_HOST: '127.0.0.1',
        HTTP_PORT: '8080',
        DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
        WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
        WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac',
        OWNER_AUTH_SECRET: 'test-owner-auth-secret-that-is-long-enough!!',
        WEBHOOK_ROUTING_SECRET: 'test-webhook-routing-secret-long-enough!!',
        PUBLIC_WEBHOOK_ORIGIN: 'https://hooks.turni.test',
        SMTP_HOST: 'smtp.turni.ru',
        SMTP_USER: 'no-reply@turni.ru',
        SMTP_PASSWORD: 'smtp-password',
        EMAIL_FROM: 'Turni <no-reply@turni.ru>',
        APP_ORIGIN: 'https://app.turni.ru'
      })
    ).toEqual({
      HTTP_HOST: '127.0.0.1',
      HTTP_PORT: 8080,
      DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
      WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
      WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac',
      OWNER_AUTH_SECRET: 'test-owner-auth-secret-that-is-long-enough!!',
      WEBHOOK_ROUTING_SECRET: 'test-webhook-routing-secret-long-enough!!',
      PUBLIC_WEBHOOK_ORIGIN: 'https://hooks.turni.test',
      SMTP_HOST: 'smtp.turni.ru',
      SMTP_PORT: 465,
      SMTP_SECURE: true,
      SMTP_USER: 'no-reply@turni.ru',
      SMTP_PASSWORD: 'smtp-password',
      EMAIL_FROM: 'Turni <no-reply@turni.ru>',
      APP_ORIGIN: 'https://app.turni.ru',
      AUTH_COOKIE_SECURE: true
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
        WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac',
        OWNER_AUTH_SECRET: 'test-owner-auth-secret-that-is-long-enough!!',
        WEBHOOK_ROUTING_SECRET: 'test-webhook-routing-secret-long-enough!!',
        PUBLIC_WEBHOOK_ORIGIN: 'https://hooks.turni.test',
        SMTP_HOST: 'smtp.turni.ru',
        SMTP_USER: 'no-reply@turni.ru',
        SMTP_PASSWORD: 'smtp-password',
        EMAIL_FROM: 'Turni <no-reply@turni.ru>',
        APP_ORIGIN: 'https://app.turni.ru'
      })
    ).toThrow();
  });

  it('requires the owner auth stack to be configured before the app boots', () => {
    const base = {
      DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
      WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
      WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac',
      OWNER_AUTH_SECRET: 'test-owner-auth-secret-that-is-long-enough!!',
      WEBHOOK_ROUTING_SECRET: 'test-webhook-routing-secret-long-enough!!',
      PUBLIC_WEBHOOK_ORIGIN: 'https://hooks.turni.test',
      SMTP_HOST: 'smtp.turni.ru',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'no-reply@turni.ru',
      SMTP_PASSWORD: 'smtp-password',
      EMAIL_FROM: 'Turni <no-reply@turni.ru>',
      APP_ORIGIN: 'https://app.turni.ru'
    };

    expect(() => readHttpEnv({ ...base, OWNER_AUTH_SECRET: 'too-short' })).toThrow();
    expect(() => readHttpEnv({ ...base, EMAIL_FROM: '' })).toThrow();
    expect(() => readHttpEnv({ ...base, APP_ORIGIN: 'app.turni.ru' })).toThrow();
    expect(() =>
      readHttpEnv({ ...base, OWNER_AUTH_SECRET: base.WIDGET_SESSION_SECRET })
    ).toThrow();
  });

  it('keeps insecure auth cookies an explicit local choice', () => {
    const base = {
      DATABASE_URL: 'postgresql://turni:turni@localhost:5432/turni',
      WIDGET_SESSION_SECRET: 'test-session-secret-that-is-long-enough-for-hmac',
      WIDGET_ROUTING_SECRET: 'test-routing-secret-that-is-long-enough-for-hmac',
      OWNER_AUTH_SECRET: 'test-owner-auth-secret-that-is-long-enough!!',
      WEBHOOK_ROUTING_SECRET: 'test-webhook-routing-secret-long-enough!!',
      PUBLIC_WEBHOOK_ORIGIN: 'https://hooks.turni.test',
      SMTP_HOST: 'smtp.turni.ru',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'no-reply@turni.ru',
      SMTP_PASSWORD: 'smtp-password',
      EMAIL_FROM: 'Turni <no-reply@turni.ru>',
      APP_ORIGIN: 'http://localhost:4200'
    };

    expect(readHttpEnv(base).AUTH_COOKIE_SECURE).toBe(true);
    expect(readHttpEnv({ ...base, AUTH_COOKIE_SECURE: 'false' }).AUTH_COOKIE_SECURE).toBe(
      false
    );
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
