import fastifyWebsocket from '@fastify/websocket';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyRequest } from 'fastify';
import {
  GuestSessionRequestSchema,
  ProblemType,
  type HealthStatus
} from '@turni/contracts';
import { GuestSessionService } from '../../modules/channels/application/guest-session.js';
import type { GuestSessionContextResolver } from '../../modules/channels/application/guest-session-context.js';
import { WidgetRoutingKeyService } from '../../modules/channels/application/widget-routing-key.js';
import { serializeCabinetStreamEvent } from '../../modules/channels/application/cabinet-sse.js';
import { CabinetStream } from '../../modules/channels/application/cabinet-stream.js';
import {
  WidgetChatConnection,
  type WidgetMessageHandler
} from '../../modules/channels/application/widget-chat-connection.js';
import { websocketPayloadToText } from './websocket-payload.js';

const healthStatus: HealthStatus = {
  status: 'ok',
  service: 'turni-backend'
};

const HttpRoute = {
  Health: '/healthz',
  GuestSessions: '/api/v1/guest/sessions',
  GuestChat: '/api/v1/guest/chat',
  CabinetStream: '/api/v1/streams/cabinet'
} as const;

class HttpAppModule {}

Module({})(HttpAppModule);

export type HttpAppOptions = Readonly<{
  guestSessionSecret?: string;
  widgetRoutingSecret?: string;
  guestSessionContextResolver?: GuestSessionContextResolver;
  widgetMessageHandler?: WidgetMessageHandler;
  cabinetStream?: CabinetStream;
  authorizeCabinetStream?: (request: FastifyRequest) => boolean;
}>;

export async function createHttpApp(
  options?: HttpAppOptions
): Promise<NestFastifyApplication> {
  const guestSessionSecret = options?.guestSessionSecret;
  let widgetRoutingKeys: WidgetRoutingKeyService | undefined;
  if (guestSessionSecret !== undefined) {
    if (options?.widgetRoutingSecret === undefined) {
      throw new Error('Widget routing secret is required when guest sessions are enabled.');
    }
    if (options.widgetRoutingSecret === guestSessionSecret) {
      throw new Error('Widget routing secret must differ from guest session secret.');
    }
    if (options.guestSessionContextResolver === undefined) {
      throw new Error('Guest session context resolver is required when guest sessions are enabled.');
    }
    widgetRoutingKeys = new WidgetRoutingKeyService(options.widgetRoutingSecret);
  }

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
  const cabinetStream = options?.cabinetStream ?? new CabinetStream();
  const authorizeCabinetStream = options?.authorizeCabinetStream ?? (() => false);
  await fastify.register(fastifyWebsocket);
  fastify.get(HttpRoute.Health, () => healthStatus);

  fastify.get(HttpRoute.CabinetStream, (request, reply) => {
    if (!authorizeCabinetStream(request)) {
      return reply.code(401).send({
        type: ProblemType.Unauthorized,
        title: 'Unauthorized',
        status: 401
      });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'content-type': 'text/event-stream'
    });
    reply.raw.write(': connected\n\n');
    const unsubscribe = cabinetStream.subscribe((event) => {
      reply.raw.write(serializeCabinetStreamEvent(event));
    });
    request.raw.once('close', unsubscribe);
  });

  if (guestSessionSecret !== undefined && widgetRoutingKeys !== undefined) {
    const guestSessions = new GuestSessionService(guestSessionSecret, widgetRoutingKeys);
    fastify.post(HttpRoute.GuestSessions, (request, reply) => {
      const parsedRequest = GuestSessionRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        return reply.code(400).send({
          type: ProblemType.InvalidRequest,
          title: 'Invalid request',
          status: 400
        });
      }

      try {
        return reply.code(201).send(guestSessions.issue(parsedRequest.data));
      } catch {
        return reply.code(400).send({
          type: ProblemType.InvalidRequest,
          title: 'Invalid request',
          status: 400
        });
      }
    });

    fastify.get(HttpRoute.GuestChat, { websocket: true }, (socket) => {
      const connection = new WidgetChatConnection(
        guestSessions,
        options?.widgetMessageHandler,
        options?.guestSessionContextResolver
      );
      socket.on('message', (rawMessage) => {
        void (async (): Promise<void> => {
          let rawEvent: unknown;
          try {
            rawEvent = JSON.parse(websocketPayloadToText(rawMessage));
          } catch {
            rawEvent = undefined;
          }

          for (const event of await connection.receive(rawEvent)) {
            socket.send(JSON.stringify(event));
          }
        })();
      });
    });
  }

  await app.init();

  return app;
}
