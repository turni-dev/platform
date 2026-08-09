import { describe, expect, it } from 'vitest';
import { FakeGuestSessionContextResolver, GuestSessionContextSchema } from '../guest-session-context.js';

const context = {
  tenantId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19f',
  agentId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19e',
  guestId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a0',
  connectionId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a1',
  sessionId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a2'
};

describe('guest session context', () => {
  it('strictly validates UUIDv7 context and resolves it by widget key', async () => {
    const resolver = new FakeGuestSessionContextResolver({ widget_demo: context });
    await expect(resolver.resolve('widget_demo')).resolves.toEqual(context);
    expect(() => GuestSessionContextSchema.parse({ ...context, extra: true })).toThrow();
  });

  it('fails closed for an unknown widget key', async () => {
    const resolver = new FakeGuestSessionContextResolver({});
    await expect(resolver.resolve('unknown')).rejects.toThrow('Guest session context not found.');
  });
});
