import { describe, expect, it } from 'vitest';
import { GuestSessionService } from './guest-session.js';

const secret = 'test-session-secret-that-is-long-enough-for-hmac';
const issuedAt = new Date('2026-07-12T12:00:00.000Z');

describe('GuestSessionService', () => {
  it('issues a signed short-lived session for a widget key', () => {
    const service = new GuestSessionService(secret);

    const session = service.issue({ widgetKey: 'widget_public_demo' }, issuedAt);

    expect(session.expiresAt).toBe('2026-07-12T12:15:00.000Z');
    expect(service.verify(session.token, issuedAt)).toEqual({
      widgetKey: 'widget_public_demo'
    });
  });

  it('rejects a token whose payload has been changed', () => {
    const service = new GuestSessionService(secret);
    const session = service.issue({ widgetKey: 'widget_public_demo' }, issuedAt);
    const [payload, signature] = session.token.split('.');

    expect(payload).toBeDefined();
    expect(signature).toBeDefined();
    const altered = `${Buffer.from(
      JSON.stringify({ widgetKey: 'another_widget', expiresAt: 1_784_174_500_000 })
    ).toString('base64url')}.${signature}`;

    expect(() => service.verify(altered, issuedAt)).toThrow('Invalid guest session');
  });

  it('rejects an expired session', () => {
    const service = new GuestSessionService(secret);
    const session = service.issue({ widgetKey: 'widget_public_demo' }, issuedAt);

    expect(() =>
      service.verify(session.token, new Date('2026-07-12T12:15:00.001Z'))
    ).toThrow('Expired guest session');
  });
});
