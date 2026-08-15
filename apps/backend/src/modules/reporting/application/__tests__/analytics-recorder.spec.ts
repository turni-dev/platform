import { describe, expect, it } from 'vitest';
import { AnalyticsRecorder } from '../analytics-recorder.js';
import type { DomainEventBus } from '../domain-event-bus.port.js';
import { FakeDomainEventBus } from '../fake-domain-event-bus.js';

const tenantId = '01900000-0000-7000-8000-000000000001';
const userId = '01900000-0000-7000-8000-000000000002';
const at = new Date('2026-08-15T10:00:00.000Z');

function build(bus: DomainEventBus): AnalyticsRecorder {
  let sequence = 0;

  return new AnalyticsRecorder(bus, {
    next: () => {
      sequence += 1;
      return `01900000-0000-7000-8000-00000000010${sequence}`;
    }
  });
}

describe('AnalyticsRecorder', () => {
  it('wraps a fact in a versioned tenant-scoped envelope', async () => {
    const bus = new FakeDomainEventBus();

    await build(bus).record({
      name: 'agent.created',
      tenantId,
      actor: { type: 'owner', id: userId },
      props: { agentId: tenantId },
      at
    });

    expect(bus.publishedEvents).toEqual([
      {
        id: '01900000-0000-7000-8000-000000000101',
        tenantId,
        name: 'agent.created',
        version: 1,
        actor: { type: 'owner', id: userId },
        correlationId: '01900000-0000-7000-8000-000000000102',
        props: { agentId: tenantId },
        createdAt: at.toISOString()
      }
    ]);
  });

  it('never lets a failed publish reach the caller', async () => {
    const failing: DomainEventBus = {
      publish: () => Promise.reject(new Error('events table unavailable'))
    };

    await expect(
      build(failing).record({
        name: 'agent.created',
        tenantId,
        actor: { type: 'owner' },
        props: {},
        at
      })
    ).resolves.toBeUndefined();
  });

  it('refuses an envelope the contract rejects instead of writing a broken row', async () => {
    const bus = new FakeDomainEventBus();

    await build(bus).record({
      name: 'agent.created',
      tenantId: 'not-a-uuid',
      actor: { type: 'owner' },
      props: {},
      at
    });

    expect(bus.publishedEvents).toEqual([]);
  });
});
