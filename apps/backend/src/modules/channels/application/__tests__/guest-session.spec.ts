import { describe, expect, it } from 'vitest';

import { GuestSessionService } from '../guest-session.js';
import { WidgetRoutingKeyService } from '../widget-routing-key.js';

const secret = 'test-session-secret-that-is-long-enough-for-hmac';
const issuedAt = new Date('2026-07-12T12:00:00.000Z');
const routingClaims = {
  tenantId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19f',
  agentId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19e',
  connectionId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a0',
  expiresAt: Math.floor(issuedAt.getTime() / 1_000) + 3_600,
  kid: 'primary'
};

function signedWidgetKey(): string {
  return new WidgetRoutingKeyService(secret).issue(routingClaims);
}

describe('GuestSessionService', () => {
  it('verifies a signed routing key and returns its trusted context from the session', () => {
    const service = new GuestSessionService(secret);
    const widgetKey = signedWidgetKey();

    const session = service.issue({ widgetKey }, issuedAt);

    expect(session.expiresAt).toBe('2026-07-12T12:15:00.000Z');
    expect(service.verify(session.token, issuedAt)).toEqual({
      widgetKey,
      ...routingClaims
    });
  });

  it('rejects an unsigned widget key before issuing a session', () => {
    const service = new GuestSessionService(secret);

    expect(() => service.issue({ widgetKey: 'widget_public_demo' }, issuedAt)).toThrow();
  });

  it('rejects a token whose payload has been changed', () => {
    const service = new GuestSessionService(secret);
    const session = service.issue({ widgetKey: signedWidgetKey() }, issuedAt);
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
    const session = service.issue({ widgetKey: signedWidgetKey() }, issuedAt);

    expect(() =>
      service.verify(session.token, new Date('2026-07-12T12:15:00.001Z'))
    ).toThrow('Expired guest session');
  });
});
