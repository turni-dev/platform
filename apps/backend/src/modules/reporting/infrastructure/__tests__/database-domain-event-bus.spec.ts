import { describe, expect, it } from 'vitest';
import type { DomainEventEnvelope } from '@turni/contracts';
import { DatabaseDomainEventBus } from '../database-domain-event-bus.js';

const event: DomainEventEnvelope = {
  id: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19e',
  tenantId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d19f',
  name: 'booking.created',
  version: 1,
  actor: { type: 'guest', id: 'guest-1' },
  correlationId: '018f8d7e-5f1a-7c1f-8f38-2b325d59d1a0',
  props: { bookingId: 'booking-1' },
  createdAt: '2026-08-09T10:00:00.000Z'
};

describe('DatabaseDomainEventBus', () => {
  it('validates then appends only canonical envelope fields', async () => {
    const appended: unknown[] = [];
    const bus = new DatabaseDomainEventBus({
      append: (value) => {
        appended.push(value);
        return Promise.resolve();
      }
    });

    await bus.publish(event);

    expect(appended).toEqual([event]);
  });

  it('rejects an invalid envelope before calling persistence', async () => {
    let calls = 0;
    const bus = new DatabaseDomainEventBus({
      append: () => {
        calls += 1;
        return Promise.resolve();
      }
    });

    await expect(bus.publish({ ...event, version: 0 })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
