import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { HealthStatus } from '@turni/contracts';

const healthStatus: HealthStatus = {
  status: 'ok',
  service: 'turni-backend'
};

class HttpAppModule {}

Module({})(HttpAppModule);

export async function createHttpApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    HttpAppModule,
    new FastifyAdapter({
      logger: false
    }),
    {
      logger: false
    }
  );

  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/healthz', () => healthStatus);

  await app.init();

  return app;
}
