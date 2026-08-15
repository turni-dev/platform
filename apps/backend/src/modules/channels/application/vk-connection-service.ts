import type {
  CredentialValidation,
  MessengerConnection,
  WebhookSetup
} from '@turni/contracts';
import { z } from 'zod';
import type { SecretCipher } from '../../../platform/crypto/secret-cipher.js';
import type { ChannelAnalytics } from './channel-analytics.js';
import type {
  ChannelConnectionRepositoryPort,
  ChannelConnectionSummary
} from './channel-connection-repository.port.js';
import type { WebhookRoutingKeyService } from './webhook-routing-key.js';

/** The wizard needs only these three of the messenger's abilities. */
export interface ChannelMessenger {
  validateCredentials(
    credentials: Readonly<{ secret: string }>
  ): Promise<CredentialValidation>;
  confirmationCode(): Promise<string>;
  setupWebhook(connection: MessengerConnection, setup: WebhookSetup): Promise<void>;
}

export interface ChannelMessengerFactory {
  create(
    input: Readonly<{ accessKey: string; groupId: number; connectionId?: string }>
  ): ChannelMessenger;
}

export interface ChannelAgentLookup {
  findByTenant(tenantId: string): Promise<Readonly<{ agentId: string }> | undefined>;
}

export interface ChannelIdGenerator {
  next(): string;
}

/** The key the provider will send back to us on every callback. */
export interface WebhookSecretGenerator {
  next(): string;
}

export class InvalidChannelCredentialsError extends Error {
  public constructor() {
    super('The community access key was refused by the provider');
    this.name = 'InvalidChannelCredentialsError';
  }
}

export class MissingAgentError extends Error {
  public constructor() {
    super('A channel needs an agent to answer with');
    this.name = 'MissingAgentError';
  }
}

const ConnectInputSchema = z.strictObject({
  tenantId: z.uuidv7(),
  userId: z.uuidv7(),
  accessKey: z.string().trim().min(1),
  groupId: z.number().int().positive()
});

export type VkConnectInput = z.input<typeof ConnectInputSchema>;

export interface VkConnectionServiceOptions {
  readonly connections: ChannelConnectionRepositoryPort;
  readonly cipher: SecretCipher;
  readonly agents: ChannelAgentLookup;
  readonly messengers: ChannelMessengerFactory;
  readonly routingKeys: WebhookRoutingKeyService;
  readonly webhookOrigin: string;
  readonly ids: ChannelIdGenerator;
  readonly secrets: WebhookSecretGenerator;
  readonly analytics: ChannelAnalytics;
  readonly clock: () => Date;
}

/**
 * One step for the owner: paste the community key. Everything the provider
 * needs from us — the confirmation code, the callback URL, the shared secret —
 * is arranged here, and the connection stays `pending` until VK confirms the
 * address by calling us back.
 */
export class VkConnectionService {
  public constructor(private readonly options: VkConnectionServiceOptions) {}

  public async connect(input: VkConnectInput): Promise<ChannelConnectionSummary> {
    const request = ConnectInputSchema.parse(input);
    const agent = await this.options.agents.findByTenant(request.tenantId);
    if (agent === undefined) {
      throw new MissingAgentError();
    }

    const messenger = this.options.messengers.create({
      accessKey: request.accessKey,
      groupId: request.groupId
    });
    const validation = await messenger.validateCredentials({ secret: request.accessKey });
    if (!validation.valid) {
      throw new InvalidChannelCredentialsError();
    }

    const communityName = validation.identity ?? 'Сообщество';
    const connectionId = this.options.ids.next();
    const webhookSecret = this.options.secrets.next();
    const confirmationCode = await messenger.confirmationCode();

    // The row exists before the server is registered on purpose: VK calls the
    // URL for confirmation the moment it is registered, and a callback that
    // finds no connection has nothing to answer with.
    await this.options.connections.create({
      id: connectionId,
      tenantId: request.tenantId,
      agentId: agent.agentId,
      type: 'vk',
      status: 'pending',
      credentialsEncrypted: this.options.cipher.encrypt(
        request.accessKey,
        request.tenantId
      ),
      webhookSecret,
      metadata: {
        community_name: communityName,
        group_id: request.groupId,
        confirmation_code: confirmationCode
      }
    });

    await messenger.setupWebhook(
      { id: connectionId, type: 'vk' },
      {
        url: this.callbackUrl(request.tenantId, connectionId),
        secret: webhookSecret
      }
    );

    await this.options.analytics.connected(
      {
        tenantId: request.tenantId,
        connectionId,
        channel: 'vk',
        at: this.options.clock()
      },
      request.groupId
    );

    return { id: connectionId, type: 'vk', status: 'pending', communityName };
  }

  public async list(tenantId: string): Promise<readonly ChannelConnectionSummary[]> {
    return this.options.connections.listByTenant(z.uuidv7().parse(tenantId));
  }

  private callbackUrl(tenantId: string, connectionId: string): string {
    const key = this.options.routingKeys.issue({ tenantId, connectionId });

    return `${this.options.webhookOrigin}/api/v1/webhooks/vk/${key}`;
  }
}
