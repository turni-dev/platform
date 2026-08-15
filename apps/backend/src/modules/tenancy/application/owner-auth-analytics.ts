import type { JsonValue } from '@turni/contracts';
import {
  AnalyticsRecorder,
  type AnalyticsIdGeneratorPort
} from '../../reporting/application/analytics-recorder.js';
import type { DomainEventBus } from '../../reporting/application/domain-event-bus.port.js';

export const OwnerAuthEventName = {
  Registered: 'owner.registered',
  SignedIn: 'owner.signed_in',
  SignedOut: 'owner.signed_out'
} as const;

/**
 * Turns owner authentication outcomes into analytics events. Props carry ids
 * only: the owner email is PII and never leaves the auth tables.
 */
export class OwnerAuthAnalytics {
  private readonly recorder: AnalyticsRecorder;

  public constructor(bus: DomainEventBus, ids: AnalyticsIdGeneratorPort) {
    this.recorder = new AnalyticsRecorder(bus, ids);
  }

  public async ownerRegistered(
    input: Readonly<{ tenantId: string; userId: string; sessionId: string; at: Date }>
  ): Promise<void> {
    await this.record(OwnerAuthEventName.Registered, input, {
      sessionId: input.sessionId
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
    await this.record(OwnerAuthEventName.SignedIn, input, {
      sessionId: input.sessionId,
      registration: input.registration
    });
  }

  /**
   * A sign-out is proven by the refresh credential, which names the session and
   * its tenant but not the person, so the actor stays anonymous.
   */
  public async ownerSignedOut(
    input: Readonly<{ tenantId: string; sessionId: string; at: Date }>
  ): Promise<void> {
    await this.recorder.record({
      name: OwnerAuthEventName.SignedOut,
      tenantId: input.tenantId,
      actor: { type: 'owner' },
      props: { sessionId: input.sessionId },
      at: input.at
    });
  }

  private async record(
    name: string,
    owner: Readonly<{ tenantId: string; userId: string; at: Date }>,
    props: Record<string, JsonValue>
  ): Promise<void> {
    await this.recorder.record({
      name,
      tenantId: owner.tenantId,
      actor: { type: 'owner', id: owner.userId },
      props,
      at: owner.at
    });
  }
}
