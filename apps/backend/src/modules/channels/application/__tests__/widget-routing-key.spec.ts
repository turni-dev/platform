import { describe, expect, it } from 'vitest';
import { WidgetRoutingKeyService } from '../widget-routing-key.js';

const claims = { tenantId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19f', agentId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19e', connectionId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a0', expiresAt: 1_800_000_000, kid: 'primary' };

describe('WidgetRoutingKeyService', () => {
  it('issues and verifies a signed strict routing envelope', () => {
    const service = new WidgetRoutingKeyService('a-secret-with-at-least-thirty-two-bytes');
    expect(service.verify(service.issue(claims), 1_700_000_000)).toEqual(claims);
  });

  it('rejects tampered and expired keys', () => {
    const service = new WidgetRoutingKeyService('a-secret-with-at-least-thirty-two-bytes');
    const key = service.issue(claims);
    expect(() => service.verify(`${key}x`, 1_700_000_000)).toThrow();
    expect(() => service.verify(key, 1_900_000_000)).toThrow();
  });
});
