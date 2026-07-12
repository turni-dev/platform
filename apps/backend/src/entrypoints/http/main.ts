import 'reflect-metadata';
import { readHttpEnv } from '../../platform/env.js';
import { createHttpApp } from './app.js';

async function bootstrap(): Promise<void> {
  const env = readHttpEnv();
  const app = await createHttpApp({
    guestSessionSecret: env.WIDGET_SESSION_SECRET
  });

  await app.listen({
    host: env.HTTP_HOST,
    port: env.HTTP_PORT
  });
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
