import 'reflect-metadata';
import { DurableGuestSessionService } from '../../modules/channels/application/durable-guest-session.js';
import { GuestSessionService } from '../../modules/channels/application/guest-session.js';
import { UuidV7Generator } from '../../modules/channels/application/uuid-v7-generator.js';
import { PostgresGuestSessionStore } from '../../modules/channels/infrastructure/database/postgres-guest-session-store.js';
import { WidgetRoutingKeyService } from '../../modules/channels/application/widget-routing-key.js';
import { createPostgresTenantDatabase } from '../../platform/database/postgres-tenant-database.js';
import { readHttpEnv } from '../../platform/env.js';
import { createHttpApp } from './app.js';

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
    app = await createHttpApp({ guestSessionService: guestSessions });
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

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
