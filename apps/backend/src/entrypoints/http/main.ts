import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { ChannelAnalytics } from '../../modules/channels/application/channel-analytics.js';
import { InboundMessageService } from '../../modules/channels/application/inbound-message-service.js';
import { VkConnectionService } from '../../modules/channels/application/vk-connection-service.js';
import { WebhookRoutingKeyService } from '../../modules/channels/application/webhook-routing-key.js';
import { PostgresChannelConnectionRepository } from '../../modules/channels/infrastructure/database/postgres-channel-connection-repository.js';
import { PostgresGuestConversationStore } from '../../modules/channels/infrastructure/database/postgres-guest-conversation-store.js';
import { PostgresWebhookInbox } from '../../modules/channels/infrastructure/database/postgres-webhook-inbox.js';
import { FaqChatPipeline } from '../../modules/chat/application/faq-chat-pipeline.js';
import {
  FrontlineWorkflow,
  type FrontlineFaqEntry
} from '../../modules/frontline/application/frontline-workflow.js';
import { KnowledgeFaqSource } from '../../modules/frontline/application/knowledge-faq-source.js';
import { FakePolicyClassifier } from '../../modules/policy/application/fake-policy-classifier.js';
import { PolicyCascade } from '../../modules/policy/application/policy-cascade.js';
import { PolicyEngine } from '../../modules/policy/domain/policy-engine.js';
import { SecretCipher } from '../../platform/crypto/secret-cipher.js';
import { readSecretKeyRing } from '../../platform/crypto/secret-key-ring.js';
import { createVkMessenger } from '../../platform/integrations/vk/index.js';
import type { ChannelHttpOptions } from './channel-routes.js';
import type { VkWebhookHttpOptions } from './vk-webhook-routes.js';
import { DurableGuestSessionService } from '../../modules/channels/application/durable-guest-session.js';
import { GuestSessionService } from '../../modules/channels/application/guest-session.js';
import { UuidV7Generator } from '../../modules/channels/application/uuid-v7-generator.js';
import { PostgresGuestSessionStore } from '../../modules/channels/infrastructure/database/postgres-guest-session-store.js';
import { WidgetRoutingKeyService } from '../../modules/channels/application/widget-routing-key.js';
import { PostgresIdempotencyKeyRepository } from '../../platform/idempotency/postgres-idempotency-key-repository.js';
import { AgentConfigurationAnalytics } from '../../modules/agent-core/application/agent-configuration-analytics.js';
import { GoogleConnectionService } from '../../modules/integrations/google/application/google-connection-service.js';
import { GoogleIntegrationAnalytics } from '../../modules/integrations/google/application/google-integration-analytics.js';
import { GoogleOauthStateService } from '../../modules/integrations/google/application/google-oauth-state.js';
import { PostgresGoogleConnectionRepository } from '../../modules/integrations/google/infrastructure/database/postgres-google-connection-repository.js';
import { AgentConfigurationService } from '../../modules/agent-core/application/agent-configuration-service.js';
import { PostgresAgentFileStore } from '../../modules/agent-core/infrastructure/database/postgres-agent-file-store.js';
import { PostgresAgentRepository } from '../../modules/agent-core/infrastructure/database/postgres-agent-repository.js';
import { DatabaseDomainEventBus } from '../../modules/reporting/infrastructure/database-domain-event-bus.js';
import { PostgresDomainEventStore } from '../../modules/reporting/infrastructure/database/postgres-domain-event-store.js';
import { OwnerAccessTokenService } from '../../modules/tenancy/application/owner-access-token.js';
import { OwnerAuthAnalytics } from '../../modules/tenancy/application/owner-auth-analytics.js';
import { OwnerAuthService } from '../../modules/tenancy/application/owner-auth-service.js';
import { OwnerAuthThrottle } from '../../modules/tenancy/application/owner-auth-throttle.js';
import { OwnerSessionCredentialService } from '../../modules/tenancy/application/owner-session-credential.js';
import { OwnerSessionService } from '../../modules/tenancy/application/owner-session.js';
import { PostgresOwnerAuthChallengeStore } from '../../modules/tenancy/infrastructure/database/postgres-owner-auth-challenge-store.js';
import { PostgresOwnerRegistrationRepository } from '../../modules/tenancy/infrastructure/database/postgres-owner-registration-repository.js';
import { PostgresOwnerSessionStore } from '../../modules/tenancy/infrastructure/database/postgres-owner-session-store.js';
import { InMemoryKeyValueCache } from '../../platform/cache/in-memory-key-value-cache.js';
import { createPostgresTenantDatabase } from '../../platform/database/postgres-tenant-database.js';
import { readHttpEnv } from '../../platform/env.js';
import { createNodemailerTransport } from '../../platform/integrations/smtp/nodemailer-transport.js';
import { GoogleOauthClient } from '../../platform/integrations/google/index.js';
import { SmtpOwnerAuthNotifier } from '../../platform/integrations/smtp/smtp-owner-auth-notifier.js';
import { createHttpApp } from './app.js';
import type { AgentHttpOptions } from './agent-routes.js';
import type { OwnerAuthHttpOptions } from './owner-auth-routes.js';
import type { GoogleIntegrationHttpOptions } from './google-integration-routes.js';

async function bootstrap(): Promise<void> {
  const env = readHttpEnv();
  const database = createPostgresTenantDatabase({ databaseUrl: env.DATABASE_URL });
  const widgetRoutingKeys = new WidgetRoutingKeyService(env.WIDGET_ROUTING_SECRET);
  const signedSessions = new GuestSessionService(
    env.WIDGET_SESSION_SECRET,
    widgetRoutingKeys
  );
  const guestSessions = new DurableGuestSessionService(
    signedSessions,
    new PostgresGuestSessionStore(database.database),
    new UuidV7Generator()
  );
  let app: Awaited<ReturnType<typeof createHttpApp>> | undefined;

  try {
    const channels = composeChannels(env, database.database);
    app = await createHttpApp({
      guestSessionService: guestSessions,
      ownerAuth: composeOwnerAuth(env, database.database),
      agent: composeAgent(env, database.database),
      google: composeGoogle(env, database.database),
      channels: channels.cabinet,
      vkWebhook: channels.webhook
    });
    const fastify = app.getHttpAdapter().getInstance();
    fastify.addHook('onClose', async () => database.close());
    app.enableShutdownHooks();

    await app.listen({
      host: env.HTTP_HOST,
      port: env.HTTP_PORT
    });
  } catch (error) {
    if (app === undefined) {
      await database.close();
    } else {
      await app.close();
    }
    throw error;
  }
}

function composeGoogle(
  env: ReturnType<typeof readHttpEnv>,
  database: ReturnType<typeof createPostgresTenantDatabase>['database']
): GoogleIntegrationHttpOptions {
  const ids = new UuidV7Generator();
  const connections = new PostgresGoogleConnectionRepository(database);
  const agents = new PostgresAgentRepository(database);

  return {
    service: new GoogleConnectionService({
      connections,
      cipher: new SecretCipher('credentials', readSecretKeyRing('credentials')),
      agents: {
        findByTenant: async (tenantId) => {
          const agent = await agents.findByTenant(tenantId);
          return agent === undefined ? undefined : { agentId: agent.agentId };
        }
      },
      oauth: new GoogleOauthClient({
        clientId: env.GOOGLE_OAUTH_CLIENT_ID,
        clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET
      }),
      stateService: new GoogleOauthStateService(env.GOOGLE_OAUTH_STATE_SECRET),
      redirectUri: new URL('/api/v1/integrations/google/callback', env.PUBLIC_WEBHOOK_ORIGIN).toString(),
      ids,
      analytics: new GoogleIntegrationAnalytics(
        new DatabaseDomainEventBus(new PostgresDomainEventStore(database)),
        ids
      ),
      clock: () => new Date()
    }),
    connections,
    accessTokens: new OwnerAccessTokenService(env.OWNER_AUTH_SECRET),
    allowedOrigins: [new URL(env.APP_ORIGIN).origin],
    cabinetRedirectUrl: new URL('/integrations/google', env.APP_ORIGIN).toString()
  };
}

/**
 * Wires the owner auth stack. The throttle currently runs on a process-local
 * cache, so cooldowns and rate limits hold per instance; a shared cache is the
 * next step before the backend scales out.
 */
function composeOwnerAuth(
  env: ReturnType<typeof readHttpEnv>,
  database: ReturnType<typeof createPostgresTenantDatabase>['database']
): OwnerAuthHttpOptions {
  const ids = new UuidV7Generator();
  const owners = new PostgresOwnerRegistrationRepository(database);
  const accessTokens = new OwnerAccessTokenService(env.OWNER_AUTH_SECRET);
  const sessions = new OwnerSessionService(
    new PostgresOwnerSessionStore(database),
    new OwnerSessionCredentialService(env.OWNER_AUTH_SECRET),
    accessTokens,
    ids
  );

  return {
    sessions,
    accessTokens,
    owners,
    secureCookies: env.AUTH_COOKIE_SECURE,
    allowedOrigins: [new URL(env.APP_ORIGIN).origin],
    service: new OwnerAuthService({
      challenges: new PostgresOwnerAuthChallengeStore(database),
      registrations: owners,
      notifier: new SmtpOwnerAuthNotifier(
        createNodemailerTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE,
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD
        }),
        { from: env.EMAIL_FROM }
      ),
      throttle: new OwnerAuthThrottle(
        new InMemoryKeyValueCache(),
        env.OWNER_AUTH_SECRET
      ),
      sessions,
      ids,
      secret: env.OWNER_AUTH_SECRET,
      analytics: new OwnerAuthAnalytics(
        new DatabaseDomainEventBus(new PostgresDomainEventStore(database)),
        ids
      )
    })
  };
}

/** The cabinet's agent stack: markdown in Postgres, events in the same tenant. */
function composeAgent(
  env: ReturnType<typeof readHttpEnv>,
  database: ReturnType<typeof createPostgresTenantDatabase>['database']
): AgentHttpOptions {
  const ids = new UuidV7Generator();

  return {
    owners: new PostgresOwnerRegistrationRepository(database),
    accessTokens: new OwnerAccessTokenService(env.OWNER_AUTH_SECRET),
    allowedOrigins: [new URL(env.APP_ORIGIN).origin],
    service: new AgentConfigurationService({
      agents: new PostgresAgentRepository(database),
      files: new PostgresAgentFileStore(database),
      ids,
      analytics: new AgentConfigurationAnalytics(
        new DatabaseDomainEventBus(new PostgresDomainEventStore(database)),
        ids
      )
    })
  };
}

/**
 * The VK channel, both halves of it: the cabinet routes an owner connects a
 * community through, and the public callback a guest's message arrives on.
 * This is also where FaqChatPipeline finally runs in production — until now it
 * existed only in tests — with FrontLine fed by the knowledge file the owner
 * edits in the cabinet.
 */
function composeChannels(
  env: ReturnType<typeof readHttpEnv>,
  database: ReturnType<typeof createPostgresTenantDatabase>['database']
): Readonly<{ cabinet: ChannelHttpOptions; webhook: VkWebhookHttpOptions }> {
  const ids = new UuidV7Generator();
  const connections = new PostgresChannelConnectionRepository(database);
  const agents = new PostgresAgentRepository(database);
  const files = new PostgresAgentFileStore(database);
  const events = new DatabaseDomainEventBus(new PostgresDomainEventStore(database));
  const analytics = new ChannelAnalytics(events, ids);
  const routingKeys = new WebhookRoutingKeyService(env.WEBHOOK_ROUTING_SECRET);
  const cipher = new SecretCipher('credentials', readSecretKeyRing('credentials'));
  const faq = new KnowledgeFaqSource(files);
  const policy = new PolicyCascade(
    new PolicyEngine(),
    new FakePolicyClassifier(),
    new FakePolicyClassifier()
  );

  return {
    cabinet: {
      accessTokens: new OwnerAccessTokenService(env.OWNER_AUTH_SECRET),
      allowedOrigins: [new URL(env.APP_ORIGIN).origin],
      idempotency: new PostgresIdempotencyKeyRepository(database),
      service: new VkConnectionService({
        connections,
        cipher,
        agents: {
          findByTenant: async (tenantId) => {
            const agent = await agents.findByTenant(tenantId);

            return agent === undefined ? undefined : { agentId: agent.agentId };
          }
        },
        messengers: {
          create: (input) =>
            createVkMessenger({
              accessKey: input.accessKey,
              groupId: input.groupId,
              ...(input.connectionId === undefined
                ? {}
                : { connectionId: input.connectionId })
            })
        },
        routingKeys,
        webhookOrigin: new URL(env.PUBLIC_WEBHOOK_ORIGIN).origin,
        ids,
        secrets: { next: () => randomBytes(24).toString('base64url') },
        analytics,
        clock: () => new Date()
      })
    },
    webhook: {
      routingKeys,
      connections,
      analytics,
      inbound: new InboundMessageService({
        inbox: new PostgresWebhookInbox(database),
        store: new PostgresGuestConversationStore(database),
        ids,
        analytics,
        pipeline: {
          handle: async (input) =>
            new FaqChatPipeline(
              { evaluate: (policyInput) => policy.evaluate(policyInput) },
              new FrontlineWorkflow([...(await faqEntries(input.tenantId))]),
              events
            ).handle(input)
        },
        messenger: (message) => ({
          send: async (connection, outbound) => {
            const record = await connections.findById({
              tenantId: message.tenantId,
              connectionId: message.connectionId
            });
            if (record === undefined) {
              throw new Error('A reply was built for a connection that no longer exists');
            }

            return createVkMessenger({
              accessKey: cipher.decrypt(record.credentialsEncrypted, message.tenantId),
              groupId: Number(record.metadata['group_id']),
              connectionId: message.connectionId
            }).send(connection, outbound);
          }
        })
      })
    }
  };

  async function faqEntries(
    tenantId: string
  ): Promise<readonly FrontlineFaqEntry[]> {
    const agent = await agents.findByTenant(tenantId);

    return agent === undefined ? [] : faq.entries({ tenantId, agentId: agent.agentId });
  }
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
