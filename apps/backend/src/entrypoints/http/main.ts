import 'reflect-metadata';
import { DurableGuestSessionService } from '../../modules/channels/application/durable-guest-session.js';
import { GuestSessionService } from '../../modules/channels/application/guest-session.js';
import { UuidV7Generator } from '../../modules/channels/application/uuid-v7-generator.js';
import { PostgresGuestSessionStore } from '../../modules/channels/infrastructure/database/postgres-guest-session-store.js';
import { WidgetRoutingKeyService } from '../../modules/channels/application/widget-routing-key.js';
import { OwnerAccessTokenService } from '../../modules/tenancy/application/owner-access-token.js';
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
import { SmtpOwnerAuthNotifier } from '../../platform/integrations/smtp/smtp-owner-auth-notifier.js';
import { createHttpApp } from './app.js';
import type { OwnerAuthHttpOptions } from './owner-auth-routes.js';

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
    app = await createHttpApp({
      guestSessionService: guestSessions,
      ownerAuth: composeOwnerAuth(env, database.database)
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
      secret: env.OWNER_AUTH_SECRET
    })
  };
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
