import type { JsonValue } from '@turni/contracts';
import {
  AnalyticsRecorder,
  type AnalyticsIdGeneratorPort
} from '../../../reporting/application/analytics-recorder.js';
import type { DomainEventBus } from '../../../reporting/application/domain-event-bus.port.js';

export const GoogleIntegrationEventName = {
  Connected: 'google.connected',
  Activated: 'google.activated'
} as const;

export interface GoogleIntegrationEventContext {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly at: Date;
}

/**
 * What happened to a Google connection, never the refresh token or the
 * account email that identifies it. Props carry only the connection id and,
 * once activated, which resources were picked.
 */
export class GoogleIntegrationAnalytics {
  private readonly recorder: AnalyticsRecorder;

  public constructor(bus: DomainEventBus, ids: AnalyticsIdGeneratorPort) {
    this.recorder = new AnalyticsRecorder(bus, ids);
  }

  public async connected(context: GoogleIntegrationEventContext): Promise<void> {
    await this.record(GoogleIntegrationEventName.Connected, context, {});
  }

  public async activated(
    context: GoogleIntegrationEventContext,
    resources: Readonly<{ calendarId: string; spreadsheetId: string }>
  ): Promise<void> {
    await this.record(GoogleIntegrationEventName.Activated, context, {
      calendarId: resources.calendarId,
      spreadsheetId: resources.spreadsheetId
    });
  }

  private async record(
    name: string,
    context: GoogleIntegrationEventContext,
    props: Record<string, JsonValue>
  ): Promise<void> {
    await this.recorder.record({
      name,
      tenantId: context.tenantId,
      actor: { type: 'owner' },
      props: { connectionId: context.connectionId, ...props },
      at: context.at
    });
  }
}
