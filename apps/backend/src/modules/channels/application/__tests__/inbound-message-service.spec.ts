import { beforeEach, describe, expect, it } from 'vitest';
import { FakeMessenger } from '../../../../platform/fakes/core-fakes.js';
import { FakeDomainEventBus } from '../../../reporting/application/fake-domain-event-bus.js';
import { ChannelAnalytics } from '../channel-analytics.js';
import type {
  ConversationResolution,
  GuestConversationStorePort,
  GuestResolution,
  MessageAppend
} from '../guest-conversation-store.port.js';
import type { WebhookInboxClaim, WebhookInboxPort } from '../webhook-inbox.port.js';
import { InboundMessageService, type InboundChannelMessage } from '../inbound-message-service.js';

const tenantId = '01900000-0000-7000-8000-000000000010';
const agentId = '01900000-0000-7000-8000-000000000011';
const connectionId = '01900000-0000-7000-8000-000000000012';

class InMemoryInbox implements WebhookInboxPort {
  public readonly rows = new Map<string, 'received' | 'processed' | 'failed'>();

  public claim(claim: WebhookInboxClaim): Promise<'claimed' | 'duplicate'> {
    const status = this.rows.get(claim.externalId);
    if (status === 'received' || status === 'processed') {
      return Promise.resolve('duplicate');
    }

    this.rows.set(claim.externalId, 'received');

    return Promise.resolve('claimed');
  }

  public markProcessed(input: Readonly<{ externalId: string }>): Promise<void> {
    this.rows.set(input.externalId, 'processed');

    return Promise.resolve();
  }

  public markFailed(input: Readonly<{ externalId: string }>): Promise<void> {
    this.rows.set(input.externalId, 'failed');

    return Promise.resolve();
  }
}

class InMemoryStore implements GuestConversationStorePort {
  public readonly guests = new Map<string, string>();
  public readonly conversations = new Map<string, string>();
  public readonly messages: MessageAppend[] = [];

  public resolveGuest(input: GuestResolution): Promise<string> {
    const key = `${input.tenantId}:${input.channelRef}`;
    const existing = this.guests.get(key);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    this.guests.set(key, input.guestId);

    return Promise.resolve(input.guestId);
  }

  public resolveConversation(input: ConversationResolution): Promise<string> {
    const key = `${input.connectionId}:${input.guestId}`;
    const existing = this.conversations.get(key);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    this.conversations.set(key, input.conversationId);

    return Promise.resolve(input.conversationId);
  }

  public appendMessage(input: MessageAppend): Promise<void> {
    this.messages.push(input);

    return Promise.resolve();
  }
}

class FailingOnceMessenger extends FakeMessenger {
  private failures = 0;

  public failOnce(): void {
    this.failures = 1;
  }

  public override send(
    ...input: Parameters<FakeMessenger['send']>
  ): ReturnType<FakeMessenger['send']> {
    if (this.failures > 0) {
      this.failures -= 1;

      return Promise.reject(new Error('provider refused the send'));
    }

    return super.send(...input);
  }
}

function message(overrides: Partial<InboundChannelMessage> = {}): InboundChannelMessage {
  return {
    tenantId,
    agentId,
    connectionId,
    channel: 'vk',
    eventId: 'event-1',
    senderRef: '777',
    text: 'Когда вы работаете?',
    payload: { type: 'message_new' },
    occurredAt: new Date('2026-08-16T10:00:00.000Z'),
    ...overrides
  };
}

function build(): {
  service: InboundMessageService;
  inbox: InMemoryInbox;
  store: InMemoryStore;
  messenger: FailingOnceMessenger;
  events: FakeDomainEventBus;
} {
  const inbox = new InMemoryInbox();
  const store = new InMemoryStore();
  const messenger = new FailingOnceMessenger();
  const events = new FakeDomainEventBus();
  let sequence = 0;
  const ids = {
    next: (): string => {
      sequence += 1;

      return `01900000-0000-7000-8000-0000000001${String(sequence).padStart(2, '0')}`;
    }
  };

  return {
    inbox,
    store,
    messenger,
    events,
    service: new InboundMessageService({
      inbox,
      store,
      ids,
      analytics: new ChannelAnalytics(events, ids),
      pipeline: {
        handle: (input) =>
          Promise.resolve(
            input.text.includes('арахис')
              ? { verdict: 'needs_approval', response: 'Передам ваш вопрос администратору.' }
              : { verdict: 'auto', response: 'Мы работаем с 10:00 до 22:00.' }
          )
      },
      messenger: () => messenger
    })
  };
}

describe('InboundMessageService', () => {
  let context: ReturnType<typeof build>;

  beforeEach(() => {
    context = build();
  });

  it('answers a first-time guest and records both sides of the exchange', async () => {
    await expect(context.service.handle(message())).resolves.toBe('answered');

    expect(context.messenger.sent).toHaveLength(1);
    expect(context.messenger.sent[0]?.message).toMatchObject({
      recipientRef: '777',
      content: { type: 'text', text: 'Мы работаем с 10:00 до 22:00.' }
    });
    expect(context.store.messages.map((row) => row.role)).toEqual(['guest', 'agent']);
    expect(context.inbox.rows.get('event-1')).toBe('processed');
  });

  it('treats a repeated event as a duplicate and answers nobody twice', async () => {
    await context.service.handle(message());

    await expect(context.service.handle(message())).resolves.toBe('duplicate');
    expect(context.messenger.sent).toHaveLength(1);
    expect(context.store.messages).toHaveLength(2);
  });

  it('lets the provider retry after a failure instead of swallowing it', async () => {
    context.messenger.failOnce();

    await expect(context.service.handle(message())).rejects.toThrow();
    expect(context.inbox.rows.get('event-1')).toBe('failed');

    await expect(context.service.handle(message())).resolves.toBe('answered');
    expect(context.messenger.sent).toHaveLength(1);
  });

  it('reuses the guest and the thread on a second message', async () => {
    await context.service.handle(message());
    await context.service.handle(message({ eventId: 'event-2', text: 'а бронь?' }));

    expect(context.store.guests.size).toBe(1);
    expect(context.store.conversations.size).toBe(1);
    expect(context.store.messages).toHaveLength(4);
  });

  it('sends only the safe handoff when policy refuses to answer', async () => {
    await context.service.handle(message({ text: 'В блюде есть арахис?' }));

    expect(context.messenger.sent[0]?.message.content).toEqual({
      type: 'text',
      text: 'Передам ваш вопрос администратору.'
    });
  });

  it('records that a message arrived without recording what it said', async () => {
    await context.service.handle(message());

    const names = context.events.publishedEvents.map((event) => event.name);
    expect(names).toContain('channel.message_received');
    expect(JSON.stringify(context.events.publishedEvents)).not.toContain('Когда вы работаете');
  });
});
