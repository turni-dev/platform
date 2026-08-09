import type { DomainEventEnvelope } from '@turni/contracts';

export interface DomainEventBus {
  publish(event: DomainEventEnvelope): Promise<void>;
}
