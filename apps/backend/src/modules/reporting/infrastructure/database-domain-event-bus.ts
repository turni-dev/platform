import {
  DomainEventEnvelopeSchema,
  type DomainEventEnvelope
} from '@turni/contracts';
import type { DomainEventBus } from '../application/domain-event-bus.port.js';

export interface DomainEventPersistencePort {
  append(event: DomainEventEnvelope): Promise<void>;
}

export class DatabaseDomainEventBus implements DomainEventBus {
  public constructor(private readonly persistence: DomainEventPersistencePort) {}

  public async publish(event: DomainEventEnvelope): Promise<void> {
    const parsed = DomainEventEnvelopeSchema.parse(event);
    await this.persistence.append({
      id: parsed.id,
      tenantId: parsed.tenantId,
      name: parsed.name,
      version: parsed.version,
      actor: parsed.actor,
      correlationId: parsed.correlationId,
      props: parsed.props,
      createdAt: parsed.createdAt
    });
  }
}
