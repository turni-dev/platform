import type { MessengerConnection, WebhookSetup } from '@turni/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { SecretCipher } from '../../../../platform/crypto/secret-cipher.js';
import type { SecretKeyRing } from '../../../../platform/crypto/secret-key-ring.js';
import { FakeDomainEventBus } from '../../../reporting/application/fake-domain-event-bus.js';
import type {
  ChannelConnectionRecord,
  ChannelConnectionRepositoryPort,
  ChannelConnectionSummary
} from '../channel-connection-repository.port.js';
import { ChannelAnalytics } from '../channel-analytics.js';
import { WebhookRoutingKeyService } from '../webhook-routing-key.js';
import {
  InvalidChannelCredentialsError,
  MissingAgentError,
  VkConnectionService
} from '../vk-connection-service.js';

const tenantId = '01900000-0000-7000-8000-000000000010';
const agentId = '01900000-0000-7000-8000-000000000011';
const connectionId = '01900000-0000-7000-8000-000000000012';
const eventId = '01900000-0000-7000-8000-000000000013';
const accessKey = 'community-access-key';

const keyRing: SecretKeyRing = {
  currentVersion: 1,
  forVersion: (version) => (version === 1 ? Buffer.alloc(32, 7) : undefined),
  toJSON: () => '[test key ring]'
};

class InMemoryConnections implements ChannelConnectionRepositoryPort {
  public readonly rows: ChannelConnectionRecord[] = [];

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

  public listByTenant(tenant: string): Promise<readonly ChannelConnectionSummary[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.tenantId === tenant)
        .map((row) => ({
          id: row.id,
          type: row.type,
          status: row.status,
          communityName: String(row.metadata['community_name'])
        }))
    );
  }

  public saveMetadata(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      metadata: Record<string, unknown>;
    }>
  ): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === input.connectionId);
    if (row !== undefined) {
      this.rows[this.rows.indexOf(row)] = { ...row, metadata: input.metadata };
    }

    return Promise.resolve();
  }

  public activate(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

class StubMessenger {
  public valid = true;
  public readonly webhooks: WebhookSetup[] = [];

  public validateCredentials(): Promise<{ valid: boolean; identity?: string }> {
    return Promise.resolve(this.valid ? { valid: true, identity: 'Кафе' } : { valid: false });
  }

  public confirmationCode(): Promise<string> {
    return Promise.resolve('abc123');
  }

  public setupWebhook(_connection: MessengerConnection, setup: WebhookSetup): Promise<void> {
    this.webhooks.push(setup);

    return Promise.resolve();
  }

  public send(): Promise<{ externalId: string }> {
    return Promise.resolve({ externalId: '1' });
  }

  public parseWebhook(): Promise<never> {
    return Promise.reject(new Error('not used here'));
  }
}

function build(): {
  service: VkConnectionService;
  connections: InMemoryConnections;
  messenger: StubMessenger;
  events: FakeDomainEventBus;
  cipher: SecretCipher;
} {
  const connections = new InMemoryConnections();
  const messenger = new StubMessenger();
  const events = new FakeDomainEventBus();
  const cipher = new SecretCipher('credentials', keyRing);
  const ids = { next: (): string => connectionId };

  return {
    connections,
    messenger,
    events,
    cipher,
    service: new VkConnectionService({
      connections,
      cipher,
      agents: { findByTenant: () => Promise.resolve({ agentId }) },
      messengers: { create: () => messenger },
      routingKeys: new WebhookRoutingKeyService('routing-secret-long-enough-for-hmac-x'),
      webhookOrigin: 'https://app.example',
      ids,
      secrets: { next: (): string => 'generated-webhook-secret' },
      analytics: new ChannelAnalytics(events, { next: () => eventId }),
      clock: () => new Date('2026-08-16T10:00:00.000Z')
    })
  };
}

describe('VkConnectionService', () => {
  let context: ReturnType<typeof build>;

  beforeEach(() => {
    context = build();
  });

  it('stores the key encrypted and registers the callback under a routing key', async () => {
    const summary = await context.service.connect({
      tenantId,
      userId: agentId,
      accessKey,
      groupId: 42
    });

    expect(summary).toEqual({
      id: connectionId,
      type: 'vk',
      status: 'pending',
      communityName: 'Кафе'
    });

    const stored = context.connections.rows[0]!;
    expect(stored.credentialsEncrypted).not.toContain(accessKey);
    expect(context.cipher.decrypt(stored.credentialsEncrypted, tenantId)).toBe(accessKey);
    expect(stored.webhookSecret).toBe('generated-webhook-secret');
    expect(stored.metadata).toMatchObject({
      community_name: 'Кафе',
      group_id: 42,
      confirmation_code: 'abc123'
    });

    const webhook = context.messenger.webhooks[0]!;
    expect(webhook.url).toContain('https://app.example/api/v1/webhooks/vk/');
    expect(webhook.url).not.toContain(connectionId);
    expect(webhook.secret).toBe('generated-webhook-secret');
  });

  it('creates the connection before registering it, because VK confirms immediately', async () => {
    const order: string[] = [];
    const connections = context.connections;
    const originalCreate = connections.create.bind(connections);
    connections.create = async (record): Promise<void> => {
      order.push('create');
      await originalCreate(record);
    };
    const messenger = context.messenger;
    const originalSetup = messenger.setupWebhook.bind(messenger);
    messenger.setupWebhook = async (connection, setup): Promise<void> => {
      order.push('setup');
      await originalSetup(connection, setup);
    };

    await context.service.connect({ tenantId, userId: agentId, accessKey, groupId: 42 });

    expect(order).toEqual(['create', 'setup']);
  });

  it('records the connection without the key or the community content', async () => {
    await context.service.connect({ tenantId, userId: agentId, accessKey, groupId: 42 });

    const [event] = context.events.publishedEvents;
    expect(event?.name).toBe('channel.connected');
    expect(JSON.stringify(context.events.publishedEvents)).not.toContain(accessKey);
    expect(event?.props).toMatchObject({ connectionId, channel: 'vk', groupId: 42 });
  });

  it('refuses an invalid key and writes nothing', async () => {
    context.messenger.valid = false;

    await expect(
      context.service.connect({ tenantId, userId: agentId, accessKey: 'bad', groupId: 42 })
    ).rejects.toBeInstanceOf(InvalidChannelCredentialsError);
    expect(context.connections.rows).toHaveLength(0);
    expect(context.events.publishedEvents).toHaveLength(0);
  });

  it('refuses a tenant that has no agent to answer with', async () => {
    const events = new FakeDomainEventBus();
    const connections = new InMemoryConnections();
    const service = new VkConnectionService({
      connections,
      cipher: new SecretCipher('credentials', keyRing),
      agents: { findByTenant: () => Promise.resolve(undefined) },
      messengers: { create: () => new StubMessenger() },
      routingKeys: new WebhookRoutingKeyService('routing-secret-long-enough-for-hmac-x'),
      webhookOrigin: 'https://app.example',
      ids: { next: () => connectionId },
      secrets: { next: () => 'generated-webhook-secret' },
      analytics: new ChannelAnalytics(events, { next: () => eventId }),
      clock: () => new Date('2026-08-16T10:00:00.000Z')
    });

    await expect(
      service.connect({ tenantId, userId: agentId, accessKey, groupId: 42 })
    ).rejects.toBeInstanceOf(MissingAgentError);
    expect(connections.rows).toHaveLength(0);
  });

  it('lists connections without ever exposing a credential', async () => {
    await context.service.connect({ tenantId, userId: agentId, accessKey, groupId: 42 });

    const listed = await context.service.list(tenantId);

    expect(listed).toEqual([
      { id: connectionId, type: 'vk', status: 'pending', communityName: 'Кафе' }
    ]);
    expect(JSON.stringify(listed)).not.toContain(accessKey);
  });
});
