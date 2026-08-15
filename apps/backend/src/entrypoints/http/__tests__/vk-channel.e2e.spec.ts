import { beforeEach, describe, expect, it } from 'vitest';
import { createHttpApp } from '../app.js';
import { ChannelAnalytics } from '../../../modules/channels/application/channel-analytics.js';
import type {
  ChannelConnectionRecord,
  ChannelConnectionRepositoryPort,
  ChannelConnectionSummary
} from '../../../modules/channels/application/channel-connection-repository.port.js';
import type {
  ConversationResolution,
  GuestConversationStorePort,
  GuestResolution,
  MessageAppend
} from '../../../modules/channels/application/guest-conversation-store.port.js';
import { InboundMessageService } from '../../../modules/channels/application/inbound-message-service.js';
import type {
  WebhookInboxClaim,
  WebhookInboxPort
} from '../../../modules/channels/application/webhook-inbox.port.js';
import { WebhookRoutingKeyService } from '../../../modules/channels/application/webhook-routing-key.js';
import { FaqChatPipeline } from '../../../modules/chat/application/faq-chat-pipeline.js';
import { FrontlineWorkflow } from '../../../modules/frontline/application/frontline-workflow.js';
import { FakePolicyClassifier } from '../../../modules/policy/application/fake-policy-classifier.js';
import { PolicyCascade } from '../../../modules/policy/application/policy-cascade.js';
import { PolicyEngine } from '../../../modules/policy/domain/policy-engine.js';
import { FakeDomainEventBus } from '../../../modules/reporting/application/fake-domain-event-bus.js';
import { FakeMessenger } from '../../../platform/fakes/core-fakes.js';

const tenantId = '01900000-0000-7000-8000-000000000010';
const agentId = '01900000-0000-7000-8000-000000000011';
const connectionId = '01900000-0000-7000-8000-000000000012';
const routingSecret = 'e2e-webhook-routing-secret-long-enough!!';
const webhookSecret = 'registered-webhook-secret';
const confirmationCode = 'confirm-me-123';
const openingHours = 'Мы работаем ежедневно с 10:00 до 22:00.';
const handoff = 'Передам ваш вопрос администратору.';

class InMemoryConnections implements ChannelConnectionRepositoryPort {
  public readonly rows: ChannelConnectionRecord[] = [
    {
      id: connectionId,
      tenantId,
      agentId,
      type: 'vk',
      status: 'pending',
      credentialsEncrypted: 'v1:iv:ct:tag',
      webhookSecret,
      metadata: { community_name: 'Кафе', group_id: 42, confirmation_code: confirmationCode }
    }
  ];

  public create(record: ChannelConnectionRecord): Promise<void> {
    this.rows.push(record);

    return Promise.resolve();
  }

  public findById(
    input: Readonly<{ tenantId: string; connectionId: string }>
  ): Promise<ChannelConnectionRecord | undefined> {
    return Promise.resolve(
      this.rows.find(
        (row) => row.tenantId === input.tenantId && row.id === input.connectionId
      )
    );
  }

  public listByTenant(): Promise<readonly ChannelConnectionSummary[]> {
    return Promise.resolve([]);
  }

  public saveMetadata(): Promise<void> {
    return Promise.resolve();
  }

  public activate(input: Readonly<{ connectionId: string }>): Promise<boolean> {
    const row = this.rows.find((candidate) => candidate.id === input.connectionId);
    if (row === undefined || row.status !== 'pending') {
      return Promise.resolve(false);
    }
    this.rows[this.rows.indexOf(row)] = { ...row, status: 'active' };

    return Promise.resolve(true);
  }
}

class InMemoryInbox implements WebhookInboxPort {
  public readonly rows = new Map<string, string>();

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
    const existing = this.guests.get(key) ?? input.guestId;
    this.guests.set(key, existing);

    return Promise.resolve(existing);
  }

  public resolveConversation(input: ConversationResolution): Promise<string> {
    const key = `${input.connectionId}:${input.guestId}`;
    const existing = this.conversations.get(key) ?? input.conversationId;
    this.conversations.set(key, existing);

    return Promise.resolve(existing);
  }

  public appendMessage(input: MessageAppend): Promise<void> {
    this.messages.push(input);

    return Promise.resolve();
  }
}

function callbackBody(
  overrides: Readonly<{ eventId?: string; secret?: string; text?: string }> = {}
): Record<string, unknown> {
  return {
    type: 'message_new',
    event_id: overrides.eventId ?? 'event-1',
    group_id: 42,
    secret: overrides.secret ?? webhookSecret,
    object: {
      message: {
        from_id: 777,
        peer_id: 777,
        text: overrides.text ?? 'Когда вы работаете?'
      }
    }
  };
}

function build(): {
  app: Promise<Awaited<ReturnType<typeof createHttpApp>>>;
  url: string;
  connections: InMemoryConnections;
  inbox: InMemoryInbox;
  store: InMemoryStore;
  messenger: FakeMessenger;
  events: FakeDomainEventBus;
} {
  const connections = new InMemoryConnections();
  const inbox = new InMemoryInbox();
  const store = new InMemoryStore();
  const messenger = new FakeMessenger();
  const events = new FakeDomainEventBus();
  const routingKeys = new WebhookRoutingKeyService(routingSecret);
  let sequence = 0;
  const ids = {
    next: (): string => {
      sequence += 1;

      return `01900000-0000-7000-8000-0000000002${String(sequence).padStart(2, '0')}`;
    }
  };
  const cascade = new PolicyCascade(
    new PolicyEngine(),
    new FakePolicyClassifier([
      { confidence: 0.9, candidates: [{ verdict: 'auto', riskScore: 1, rule: 'e2e' }] }
    ]),
    new FakePolicyClassifier()
  );
  const pipeline = new FaqChatPipeline(
    { evaluate: (input) => cascade.evaluate(input) },
    new FrontlineWorkflow([
      { tenantId, question: 'Когда вы работаете?', response: openingHours }
    ]),
    events
  );

  return {
    connections,
    inbox,
    store,
    messenger,
    events,
    url: `/api/v1/webhooks/vk/${routingKeys.issue({ tenantId, connectionId })}`,
    app: createHttpApp({
      vkWebhook: {
        routingKeys,
        connections,
        analytics: new ChannelAnalytics(events, ids),
        inbound: new InboundMessageService({
          inbox,
          store,
          ids,
          analytics: new ChannelAnalytics(events, ids),
          pipeline,
          messenger: () => messenger
        })
      }
    })
  };
}

describe('VK channel end to end', () => {
  let context: ReturnType<typeof build>;
  let app: Awaited<ReturnType<typeof createHttpApp>>;

  beforeEach(async () => {
    context = build();
    app = await context.app;
  });

  it('answers a confirmation with the code and activates the connection', async () => {
    const response = await app.inject({
      method: 'POST',
      url: context.url,
      payload: { type: 'confirmation', group_id: 42, secret: webhookSecret }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(confirmationCode);
    expect(context.connections.rows[0]?.status).toBe('active');
  });

  it('answers a guest from the FAQ and returns ok', async () => {
    const response = await app.inject({ method: 'POST', url: context.url, payload: callbackBody() });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('ok');
    expect(context.messenger.sent).toHaveLength(1);
    expect(context.messenger.sent[0]?.message).toMatchObject({
      recipientRef: '777',
      content: { type: 'text', text: openingHours }
    });
    expect(context.store.messages.map((row) => row.role)).toEqual(['guest', 'agent']);
  });

  it('answers a repeated event once', async () => {
    await app.inject({ method: 'POST', url: context.url, payload: callbackBody() });
    const repeat = await app.inject({
      method: 'POST',
      url: context.url,
      payload: callbackBody()
    });

    expect(repeat.statusCode).toBe(200);
    expect(repeat.body).toBe('ok');
    expect(context.messenger.sent).toHaveLength(1);
  });

  it('sends only the safe handoff for an allergen question', async () => {
    await app.inject({
      method: 'POST',
      url: context.url,
      payload: callbackBody({ text: 'В блюде есть арахис? У меня аллергия.' })
    });

    expect(context.messenger.sent).toHaveLength(1);
    expect(context.messenger.sent[0]?.message.content).toEqual({
      type: 'text',
      text: handoff
    });
    expect(JSON.stringify(context.events.publishedEvents)).not.toContain('арахис');
  });

  it('refuses a wrong secret and writes nothing', async () => {
    const response = await app.inject({
      method: 'POST',
      url: context.url,
      payload: callbackBody({ secret: 'not-our-secret' })
    });

    expect(response.statusCode).toBe(403);
    expect(context.inbox.rows.size).toBe(0);
    expect(context.messenger.sent).toHaveLength(0);
    expect(context.store.messages).toHaveLength(0);
  });

  it('refuses a routing key signed by someone else', async () => {
    const forged = new WebhookRoutingKeyService(
      'another-e2e-routing-secret-long-enough!!'
    ).issue({ tenantId, connectionId });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/webhooks/vk/${forged}`,
      payload: callbackBody()
    });

    expect(response.statusCode).toBe(403);
    expect(context.messenger.sent).toHaveLength(0);
  });
});
