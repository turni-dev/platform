import { DomainEventEnvelopeSchema, type JsonValue } from '@turni/contracts';
import type { DomainEventBus } from '../../reporting/application/domain-event-bus.port.js';
import type { OwnerSessionIdGeneratorPort } from './owner-session-store.port.js';

export const OwnerAuthEventName = {
  Registered: 'owner.registered',
  SignedIn: 'owner.signed_in',
  SignedOut: 'owner.signed_out'
} as const;

/**
 * Turns owner authentication outcomes into analytics events. Props carry ids
 * only: the owner email is PII and never leaves the auth tables. A failed
 * publish is swallowed, because a missing metric must never cost a sign-in.
 */
export class OwnerAuthAnalytics {
  public constructor(
    private readonly bus: DomainEventBus,
    private readonly ids: OwnerSessionIdGeneratorPort
  ) {}

  public async ownerRegistered(
    input: Readonly<{ tenantId: string; userId: string; sessionId: string; at: Date }>
  ): Promise<void> {
    await this.publish({
      name: OwnerAuthEventName.Registered,
      tenantId: input.tenantId,
      userId: input.userId,
      at: input.at,
      props: { sessionId: input.sessionId }
    });
  }

  public async ownerSignedIn(
    input: Readonly<{
      tenantId: string;
      userId: string;
      sessionId: string;
      registration: boolean;
      at: Date;
    }>
  ): Promise<void> {
    await this.publish({
      name: OwnerAuthEventName.SignedIn,
      tenantId: input.tenantId,
      userId: input.userId,
      at: input.at,
      props: { sessionId: input.sessionId, registration: input.registration }
    });
  }

  /**
   * A sign-out is proven by the refresh credential, which names the session and
   * its tenant but not the person, so the actor stays anonymous.
   */
  public async ownerSignedOut(
    input: Readonly<{ tenantId: string; sessionId: string; at: Date }>
  ): Promise<void> {
    await this.publish({
      name: OwnerAuthEventName.SignedOut,
      tenantId: input.tenantId,
      at: input.at,
      props: { sessionId: input.sessionId }
    });
  }

  private async publish(
    event: Readonly<{
      name: string;
      tenantId: string;
      userId?: string;
      at: Date;
      props: Record<string, JsonValue>;
    }>
  ): Promise<void> {
    try {
      await this.bus.publish(
        DomainEventEnvelopeSchema.parse({
          id: this.ids.next(),
          tenantId: event.tenantId,
          name: event.name,
          version: 1,
          actor: {
            type: 'owner',
            ...(event.userId === undefined ? {} : { id: event.userId })
          },
          correlationId: this.ids.next(),
          props: event.props,
          createdAt: event.at.toISOString()
        })
      );
    } catch (error) {
      console.error('owner auth analytics dropped an event', {
        name: event.name,
        error
      });
    }
  }
}
