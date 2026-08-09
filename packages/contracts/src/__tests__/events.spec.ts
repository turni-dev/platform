import { describe, expect, it } from 'vitest';
import { DomainEventEnvelopeSchema } from '../events.js';

const event = {
  id: '01900000-0000-7000-8000-000000000001',
  tenantId: '01900000-0000-7000-8000-000000000002',
  name: 'reservation.created',
  version: 1,
  actor: { type: 'agent', id: 'restaurant-administrator' },
  correlationId: '01900000-0000-7000-8000-000000000003',
  props: {
    reservation: { guests: 4, confirmed: true },
    notes: null
  },
  createdAt: '2026-08-09T12:00:00.000Z'
};

describe('DomainEventEnvelopeSchema', () => {
  it('accepts a complete versioned domain event envelope', () => {
    expect(DomainEventEnvelopeSchema.parse(event)).toEqual(event);
  });

  it('requires UUIDv7 IDs for the event, tenant, and correlation', () => {
    expect(() =>
      DomainEventEnvelopeSchema.parse({ ...event, id: event.id.replace('7000', '4000') })
    ).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({ ...event, tenantId: 'tenant-1' })
    ).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({
        ...event,
        tenantId: event.tenantId.replace('7000', '4000')
      })
    ).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({ ...event, correlationId: 'correlation-1' })
    ).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({
        ...event,
        correlationId: event.correlationId.replace('7000', '4000')
      })
    ).toThrow();
  });

  it('requires a non-empty name, a positive integer version, and an ISO timestamp', () => {
    expect(() => DomainEventEnvelopeSchema.parse({ ...event, name: '' })).toThrow();
    expect(() => DomainEventEnvelopeSchema.parse({ ...event, version: 0 })).toThrow();
    expect(() => DomainEventEnvelopeSchema.parse({ ...event, version: 1.5 })).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({ ...event, createdAt: '2026-08-09' })
    ).toThrow();
  });

  it('requires a strict actor and JSON-safe object props', () => {
    expect(() =>
      DomainEventEnvelopeSchema.parse({ ...event, actor: { type: 'guest', role: 'vip' } })
    ).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({ ...event, props: { invalid: new Date() } })
    ).toThrow();
  });

  it('rejects snake-case aliases and unknown envelope fields', () => {
    expect(() =>
      DomainEventEnvelopeSchema.parse({
        ...event,
        tenant_id: event.tenantId
      })
    ).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({
        ...event,
        created_at: event.createdAt
      })
    ).toThrow();
    expect(() =>
      DomainEventEnvelopeSchema.parse({ ...event, deliveryStatus: 'pending' })
    ).toThrow();
  });
});
