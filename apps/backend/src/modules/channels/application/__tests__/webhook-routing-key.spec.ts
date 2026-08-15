import { describe, expect, it } from 'vitest';
import { WebhookRoutingKeyService } from '../webhook-routing-key.js';

const secret = 'webhook-routing-secret-long-enough-for-hmac';
const claims = {
  tenantId: '01900000-0000-7000-8000-000000000010',
  connectionId: '01900000-0000-7000-8000-000000000011'
} as const;

describe('WebhookRoutingKeyService', () => {
  it('round-trips its own key', () => {
    const service = new WebhookRoutingKeyService(secret);

    expect(service.verify(service.issue(claims))).toEqual(claims);
  });

  it('refuses a key signed with another secret', () => {
    const forged = new WebhookRoutingKeyService(
      'another-routing-secret-long-enough-for-hmac'
    ).issue(claims);

    expect(() => new WebhookRoutingKeyService(secret).verify(forged)).toThrow();
  });

  it('refuses a tampered payload', () => {
    const service = new WebhookRoutingKeyService(secret);
    const signature = service.issue(claims).split('.')[1] ?? '';

    expect(() => service.verify(`tampered.${signature}`)).toThrow();
  });

  it('refuses a malformed key', () => {
    const service = new WebhookRoutingKeyService(secret);

    expect(() => service.verify('nonsense')).toThrow();
    expect(() => service.verify('a.b.c')).toThrow();
  });

  it('refuses a secret too short to sign with', () => {
    expect(() => new WebhookRoutingKeyService('too-short')).toThrow();
  });

  it('never expires: a registered callback URL has to keep working', () => {
    const service = new WebhookRoutingKeyService(secret);
    const key = service.issue(claims);
    const decoded: unknown = JSON.parse(
      Buffer.from(key.split('.')[0] ?? '', 'base64url').toString('utf8')
    );

    expect(decoded).toEqual(claims);
  });
});
