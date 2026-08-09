import {
  DomainEventEnvelopeSchema,
  type DomainEventEnvelope
} from '@turni/contracts';
import type { DomainEventBus } from './domain-event-bus.port.js';

export class FakeDomainEventBus implements DomainEventBus {
  private readonly events: DomainEventEnvelope[] = [];

  get publishedEvents(): readonly DomainEventEnvelope[] {
    return [...this.events];
  }

  async publish(event: DomainEventEnvelope): Promise<void> {
    await Promise.resolve();
    this.events.push(DomainEventEnvelopeSchema.parse(event));
  }
}
