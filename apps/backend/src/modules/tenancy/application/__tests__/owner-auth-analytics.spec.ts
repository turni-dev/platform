import { describe, expect, it } from 'vitest';
import { FakeDomainEventBus } from '../../../reporting/application/fake-domain-event-bus.js';
import type { DomainEventBus } from '../../../reporting/application/domain-event-bus.port.js';
import { OwnerAuthAnalytics } from '../owner-auth-analytics.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const sessionId = '01900000-0000-7000-8000-000000000003';
const at = new Date('2026-08-15T10:00:00.000Z');

function build(bus: DomainEventBus): OwnerAuthAnalytics {
  let sequence = 0;

  return new OwnerAuthAnalytics(bus, {
    next: () => {
      sequence += 1;
      return `01900000-0000-7000-8000-00000000010${sequence}`;
    }
  });
}

describe('OwnerAuthAnalytics', () => {
  it('records a registration as a tenant scoped owner event', async () => {
    const bus = new FakeDomainEventBus();

    await build(bus).ownerRegistered({ tenantId, userId, sessionId, at });

    expect(bus.publishedEvents).toEqual([
      {
        id: '01900000-0000-7000-8000-000000000101',
        tenantId,
        name: 'owner.registered',
        version: 1,
        actor: { type: 'owner', id: userId },
        correlationId: '01900000-0000-7000-8000-000000000102',
        props: { sessionId },
        createdAt: at.toISOString()
      }
    ]);
  });

  it('separates a first sign-in from a returning one', async () => {
    const bus = new FakeDomainEventBus();
    const analytics = build(bus);

    await analytics.ownerSignedIn({
      tenantId,
      userId,
      sessionId,
      registration: true,
      at
    });
    await analytics.ownerSignedIn({
      tenantId,
      userId,
      sessionId,
      registration: false,
      at
    });

    expect(bus.publishedEvents.map((event) => event.name)).toEqual([
      'owner.signed_in',
      'owner.signed_in'
    ]);
    expect(bus.publishedEvents.map((event) => event.props)).toEqual([
      { sessionId, registration: true },
      { sessionId, registration: false }
    ]);
  });

  it('records a sign-out without claiming to know which user pressed it', async () => {
    const bus = new FakeDomainEventBus();

    await build(bus).ownerSignedOut({ tenantId, sessionId, at });

    expect(bus.publishedEvents).toHaveLength(1);
    expect(bus.publishedEvents[0]?.name).toBe('owner.signed_out');
    expect(bus.publishedEvents[0]?.actor).toEqual({ type: 'owner' });
  });

  it('never carries the owner email into analytics props', async () => {
    const bus = new FakeDomainEventBus();

    await build(bus).ownerRegistered({ tenantId, userId, sessionId, at });

    expect(JSON.stringify(bus.publishedEvents)).not.toContain('@');
  });

  it('swallows a failing bus so analytics can never refuse a sign-in', async () => {
    const failing: DomainEventBus = {
      publish: () => Promise.reject(new Error('events table unavailable'))
    };

    await expect(
      build(failing).ownerSignedIn({
        tenantId,
        userId,
        sessionId,
        registration: false,
        at
      })
    ).resolves.toBeUndefined();
  });
});
