import type { MessengerConnection, WebhookSetup } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import { ChannelAnalytics } from '../../../modules/channels/application/channel-analytics.js';
import type {
  ChannelConnectionRecord,
  ChannelConnectionRepositoryPort,
  ChannelConnectionSummary
} from '../../../modules/channels/application/channel-connection-repository.port.js';
import { VkConnectionService } from '../../../modules/channels/application/vk-connection-service.js';
import { WebhookRoutingKeyService } from '../../../modules/channels/application/webhook-routing-key.js';
import { FakeDomainEventBus } from '../../../modules/reporting/application/fake-domain-event-bus.js';
import { OwnerAccessTokenService } from '../../../modules/tenancy/application/owner-access-token.js';
import { SecretCipher } from '../../../platform/crypto/secret-cipher.js';
import type { SecretKeyRing } from '../../../platform/crypto/secret-key-ring.js';
import type {
  IdempotencyKeyFound,
  IdempotencyKeyRepositoryPort,
  StoreIdempotencyKeyInput
} from '../../../platform/idempotency/idempotency-key-repository.port.js';
import { createHttpApp, type HttpAppOptions } from '../app.js';
import { AuthCookieName } from '../auth-cookies.js';

const origin = 'https://app.turni.ru';
const ownerAuthSecret = 'owner-auth-secret-with-at-least-thirty-two-characters';
const tenantId = '01900000-0000-7000-8000-000000000010';
const userId = '01900000-0000-7000-8000-000000000011';
const sessionId = '01900000-0000-7000-8000-000000000012';
const agentId = '01900000-0000-7000-8000-000000000013';

const keyRing: SecretKeyRing = {
  currentVersion: 1,
  forVersion: (version) => (version === 1 ? Buffer.alloc(32, 9) : undefined),
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

  public saveMetadata(): Promise<void> {
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
}

class InMemoryIdempotencyKeyRepository implements IdempotencyKeyRepositoryPort {
  private readonly rows = new Map<string, IdempotencyKeyFound>();

  public find(
    input: Readonly<{ tenantId: string; key: string }>
  ): Promise<IdempotencyKeyFound | undefined> {
    return Promise.resolve(this.rows.get(`${input.tenantId}:${input.key}`));
  }

  public store(input: StoreIdempotencyKeyInput): Promise<void> {
    const rowKey = `${input.tenantId}:${input.key}`;
    if (!this.rows.has(rowKey)) {
      this.rows.set(rowKey, {
        requestHash: input.requestHash,
        statusCode: input.statusCode,
        response: input.response
      });
    }

    return Promise.resolve();
  }
}

function build(): {
  options: HttpAppOptions;
  connections: InMemoryConnections;
  connectCalls: () => number;
  cookie: Record<string, string>;
} {
  const connections = new InMemoryConnections();
  const events = new FakeDomainEventBus();
  const accessTokens = new OwnerAccessTokenService(ownerAuthSecret);
  let sequence = 0;
  let connectCalls = 0;
  const service = new VkConnectionService({
    connections,
    cipher: new SecretCipher('credentials', keyRing),
    agents: { findByTenant: () => Promise.resolve({ agentId }) },
    messengers: { create: () => new StubMessenger() },
    routingKeys: new WebhookRoutingKeyService('routing-secret-long-enough-for-hmac-x'),
    webhookOrigin: 'https://app.example',
    ids: {
      next: (): string => {
        sequence += 1;

        return `01900000-0000-7000-8000-0000000009${String(sequence).padStart(2, '0')}`;
      }
    },
    secrets: { next: (): string => 'generated-webhook-secret' },
    analytics: new ChannelAnalytics(events, { next: () => '01900000-0000-7000-8000-000000000099' }),
    clock: () => new Date('2026-08-16T10:00:00.000Z')
  });
  const originalConnect = service.connect.bind(service);
  service.connect = async (input) => {
    connectCalls += 1;

    return originalConnect(input);
  };

  return {
    connections,
    connectCalls: () => connectCalls,
    cookie: { cookie: `${AuthCookieName.Access}=${accessTokens.issue({ userId, tenantId, sessionId })}` },
    options: {
      channels: {
        service,
        accessTokens,
        allowedOrigins: [origin],
        idempotency: new InMemoryIdempotencyKeyRepository()
      }
    }
  };
}

describe('POST /api/v1/channels/vk idempotency', () => {
  it('connects once and stores the outcome when no header is sent', async () => {
    const context = build();
    const app = await createHttpApp(context.options);
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/channels/vk',
        headers: { origin, ...context.cookie },
        payload: { accessKey: 'community-key', groupId: 42 }
      });

      expect(response.statusCode).toBe(201);
      expect(context.connectCalls()).toBe(1);
    } finally {
      await app.close();
    }
  });

  it('creates exactly one connection for a repeated Idempotency-Key with the same body', async () => {
    const context = build();
    const app = await createHttpApp(context.options);
    try {
      const headers = {
        origin,
        ...context.cookie,
        'idempotency-key': '01900000-0000-7000-8000-0000000000aa'
      };
      const payload = { accessKey: 'community-key', groupId: 42 };

      const first = await app.inject({ method: 'POST', url: '/api/v1/channels/vk', headers, payload });
      const second = await app.inject({ method: 'POST', url: '/api/v1/channels/vk', headers, payload });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(201);
      expect(second.json()).toEqual(first.json());
      expect(context.connectCalls()).toBe(1);
      expect(context.connections.rows).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('refuses a reused key sent with a different body and creates nothing more', async () => {
    const context = build();
    const app = await createHttpApp(context.options);
    try {
      const headers = {
        origin,
        ...context.cookie,
        'idempotency-key': '01900000-0000-7000-8000-0000000000bb'
      };

      const first = await app.inject({
        method: 'POST',
        url: '/api/v1/channels/vk',
        headers,
        payload: { accessKey: 'community-key', groupId: 42 }
      });
      const second = await app.inject({
        method: 'POST',
        url: '/api/v1/channels/vk',
        headers,
        payload: { accessKey: 'community-key', groupId: 99 }
      });

      expect(first.statusCode).toBe(201);
      expect(second.statusCode).toBe(409);
      expect(context.connectCalls()).toBe(1);
      expect(context.connections.rows).toHaveLength(1);
    } finally {
      await app.close();
    }
  });

  it('lets a different Idempotency-Key create a second connection', async () => {
    const context = build();
    const app = await createHttpApp(context.options);
    try {
      const payload = { accessKey: 'community-key', groupId: 42 };

      await app.inject({
        method: 'POST',
        url: '/api/v1/channels/vk',
        headers: { origin, ...context.cookie, 'idempotency-key': '01900000-0000-7000-8000-0000000000cc' },
        payload
      });
      await app.inject({
        method: 'POST',
        url: '/api/v1/channels/vk',
        headers: { origin, ...context.cookie, 'idempotency-key': '01900000-0000-7000-8000-0000000000dd' },
        payload
      });

      expect(context.connectCalls()).toBe(2);
      expect(context.connections.rows).toHaveLength(2);
    } finally {
      await app.close();
    }
  });
});
