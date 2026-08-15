import type { MessengerPort } from '@turni/contracts';
import { z } from 'zod';
import type { ChannelAnalytics } from './channel-analytics.js';
import type { GuestConversationStorePort } from './guest-conversation-store.port.js';
import type { WebhookInboxPort } from './webhook-inbox.port.js';

const InboundChannelMessageSchema = z.strictObject({
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  connectionId: z.uuidv7(),
  channel: z.literal('vk'),
  /** The provider's own identifier for this delivery; the deduplication key. */
  eventId: z.string().min(1),
  /** The guest's address on the provider's side, both key and reply target. */
  senderRef: z.string().min(1),
  text: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.date()
});

export type InboundChannelMessage = z.infer<typeof InboundChannelMessageSchema>;

export interface AnswerPipeline {
  handle(
    input: Readonly<{
      tenantId: string;
      guestId: string;
      eventId: string;
      correlationId: string;
      occurredAt: string;
      text: string;
    }>
  ): Promise<Readonly<{ verdict: string; response: string }>>;
}

export interface InboundIdGenerator {
  next(): string;
}

export interface InboundMessageServiceOptions {
  readonly inbox: WebhookInboxPort;
  readonly store: GuestConversationStorePort;
  readonly pipeline: AnswerPipeline;
  readonly messenger: (message: InboundChannelMessage) => Pick<MessengerPort, 'send'>;
  readonly ids: InboundIdGenerator;
  readonly analytics: ChannelAnalytics;
}

/**
 * What happens to a message once a channel has been recognized — and nothing
 * about which channel it was. A second provider reuses this whole path and
 * supplies only its own parsing, secret check and transport.
 */
export class InboundMessageService {
  public constructor(private readonly options: InboundMessageServiceOptions) {}

  public async handle(input: InboundChannelMessage): Promise<'answered' | 'duplicate'> {
    const message = InboundChannelMessageSchema.parse(input);
    const claim = await this.options.inbox.claim({
      id: this.options.ids.next(),
      source: message.channel,
      externalId: message.eventId,
      payload: message.payload
    });

    if (claim === 'duplicate') {
      return 'duplicate';
    }

    try {
      await this.answer(message);
      await this.options.inbox.markProcessed({
        source: message.channel,
        externalId: message.eventId
      });

      return 'answered';
    } catch (error) {
      // Marked failed rather than processed, so the provider's next retry is
      // allowed to claim this event again instead of it being lost.
      await this.options.inbox.markFailed({
        source: message.channel,
        externalId: message.eventId,
        error: error instanceof Error ? error.name : 'unknown failure'
      });

      throw error;
    }
  }

  private async answer(message: InboundChannelMessage): Promise<void> {
    const guestId = await this.options.store.resolveGuest({
      tenantId: message.tenantId,
      channelRef: `${message.channel}:${message.senderRef}`,
      guestId: this.options.ids.next(),
      seenAt: message.occurredAt
    });
    const conversationId = await this.options.store.resolveConversation({
      tenantId: message.tenantId,
      agentId: message.agentId,
      connectionId: message.connectionId,
      guestId,
      conversationId: this.options.ids.next()
    });

    await this.options.store.appendMessage({
      tenantId: message.tenantId,
      conversationId,
      messageId: this.options.ids.next(),
      role: 'guest',
      content: message.text
    });

    const answer = await this.options.pipeline.handle({
      tenantId: message.tenantId,
      guestId,
      eventId: this.options.ids.next(),
      correlationId: this.options.ids.next(),
      occurredAt: message.occurredAt.toISOString(),
      text: message.text
    });

    await this.options.store.appendMessage({
      tenantId: message.tenantId,
      conversationId,
      messageId: this.options.ids.next(),
      role: 'agent',
      content: answer.response
    });

    await this.options.messenger(message).send(
      { id: message.connectionId, type: message.channel },
      {
        conversationId,
        recipientRef: message.senderRef,
        content: { type: 'text', text: answer.response }
      }
    );

    await this.options.analytics.messageReceived(
      {
        tenantId: message.tenantId,
        connectionId: message.connectionId,
        channel: message.channel,
        at: message.occurredAt
      },
      { verdict: answer.verdict, answered: true }
    );
  }
}
