import type { JsonValue } from '@turni/contracts';
import {
  AnalyticsRecorder,
  type AnalyticsIdGeneratorPort
} from '../../reporting/application/analytics-recorder.js';
import type { DomainEventBus } from '../../reporting/application/domain-event-bus.port.js';

export const ChannelEventName = {
  Connected: 'channel.connected',
  Confirmed: 'channel.confirmed',
  MessageReceived: 'channel.message_received'
} as const;

export interface ChannelEventContext {
  readonly tenantId: string;
  readonly connectionId: string;
  readonly channel: 'vk';
  readonly at: Date;
}

/**
 * What happened on a channel, never what was said on it. Props carry the
 * connection, the channel and the group; a guest's words and a community's
 * key belong to neither an event nor a log.
 */
export class ChannelAnalytics {
  private readonly recorder: AnalyticsRecorder;

  public constructor(bus: DomainEventBus, ids: AnalyticsIdGeneratorPort) {
    this.recorder = new AnalyticsRecorder(bus, ids);
  }

  public async connected(
    context: ChannelEventContext,
    groupId: number
  ): Promise<void> {
    await this.record(ChannelEventName.Connected, context, { groupId }, 'owner');
  }

  public async confirmed(context: ChannelEventContext): Promise<void> {
    await this.record(ChannelEventName.Confirmed, context, {}, 'system');
  }

  public async messageReceived(
    context: ChannelEventContext,
    outcome: Readonly<{ verdict: string; answered: boolean }>
  ): Promise<void> {
    await this.record(
      ChannelEventName.MessageReceived,
      context,
      { verdict: outcome.verdict, answered: outcome.answered },
      'guest'
    );
  }

  private async record(
    name: string,
    context: ChannelEventContext,
    props: Record<string, JsonValue>,
    actor: 'owner' | 'guest' | 'system'
  ): Promise<void> {
    await this.recorder.record({
      name,
      tenantId: context.tenantId,
      actor: { type: actor },
      props: { connectionId: context.connectionId, channel: context.channel, ...props },
      at: context.at
    });
  }
}
