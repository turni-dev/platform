import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DomainEventEnvelope } from '@turni/contracts';
import type { DomainEventBus } from '../domain-event-bus.port.js';
import { FakeDomainEventBus } from '../fake-domain-event-bus.js';

const firstEvent: DomainEventEnvelope = {
  id: '01900000-0000-7000-8000-000000000001',
  tenantId: '01900000-0000-7000-8000-000000000002',
  name: 'reservation.created',
  version: 1,
  actor: { type: 'agent', id: 'restaurant-administrator' },
  correlationId: '01900000-0000-7000-8000-000000000003',
  props: { reservationId: '01900000-0000-7000-8000-000000000004' },
  createdAt: '2026-08-09T12:00:00.000Z'
};

describe('FakeDomainEventBus', () => {
  it('publishes validated envelopes in their original order', async () => {
    const bus = new FakeDomainEventBus();
    const secondEvent: DomainEventEnvelope = {
      ...firstEvent,
      id: '01900000-0000-7000-8000-000000000005',
      name: 'reservation.confirmed'
    };

    await bus.publish(firstEvent);
    await bus.publish(secondEvent);

    expect(bus.publishedEvents).toEqual([firstEvent, secondEvent]);
    expectTypeOf<FakeDomainEventBus>().toMatchTypeOf<DomainEventBus>();
  });

  it('rejects an invalid envelope without adding it to the published events', async () => {
    const bus = new FakeDomainEventBus();

    await expect(
      bus.publish({ ...firstEvent, id: 'not-a-uuid-v7' })
    ).rejects.toThrow();

    expect(bus.publishedEvents).toEqual([]);
  });
});
