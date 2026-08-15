import {
  DomainEventEnvelopeSchema,
  type EventActor,
  type JsonValue
} from '@turni/contracts';
import type { DomainEventBus } from './domain-event-bus.port.js';

export interface AnalyticsIdGeneratorPort {
  next(): string;
}

export interface AnalyticsFact {
  readonly name: string;
  readonly tenantId: string;
  readonly actor: EventActor;
  readonly props: Record<string, JsonValue>;
  readonly at: Date;
}

/**
 * One place that turns a fact into a domain event envelope. Publishing is
 * best-effort on purpose: analytics must never be able to refuse the action it
 * describes, so a broken envelope or an unreachable table is logged and
 * dropped.
 */
export class AnalyticsRecorder {
  public constructor(
    private readonly bus: DomainEventBus,
    private readonly ids: AnalyticsIdGeneratorPort
  ) {}

  public async record(fact: AnalyticsFact): Promise<void> {
    try {
      await this.bus.publish(
        DomainEventEnvelopeSchema.parse({
          id: this.ids.next(),
          tenantId: fact.tenantId,
          name: fact.name,
          version: 1,
          actor: fact.actor,
          correlationId: this.ids.next(),
          props: fact.props,
          createdAt: fact.at.toISOString()
        })
      );
    } catch (error) {
      console.error('analytics dropped an event', { name: fact.name, error });
    }
  }
}
