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
import type { DurableGuestSessionService } from '../../modules/channels/application/durable-guest-session.js';
import { serializeCabinetStreamEvent } from '../../modules/channels/application/cabinet-sse.js';
import { CabinetStream } from '../../modules/channels/application/cabinet-stream.js';
import {
  WidgetChatConnection,
  type WidgetMessageHandler
} from '../../modules/channels/application/widget-chat-connection.js';
import {
  registerOwnerAuthRoutes,
  type OwnerAuthHttpOptions
} from './owner-auth-routes.js';
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
  ownerAuth?: OwnerAuthHttpOptions;
  guestSessionService?: DurableGuestSessionService;
  widgetMessageHandler?: WidgetMessageHandler;
  cabinetStream?: CabinetStream;
  authorizeCabinetStream?: (request: FastifyRequest) => boolean;
}>;

export async function createHttpApp(
  options?: HttpAppOptions
): Promise<NestFastifyApplication> {
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

  if (options?.ownerAuth !== undefined) {
    registerOwnerAuthRoutes(fastify, options.ownerAuth);
  }

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

  if (options?.guestSessionService !== undefined) {
    const guestSessions = options.guestSessionService;
    fastify.post(HttpRoute.GuestSessions, async (request, reply) => {
      const parsedRequest = GuestSessionRequestSchema.safeParse(request.body);
      if (!parsedRequest.success) {
        return reply.code(400).send({
          type: ProblemType.InvalidRequest,
          title: 'Invalid request',
          status: 400
        });
      }

      try {
        return reply.code(201).send(await guestSessions.issue(parsedRequest.data));
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
        options?.widgetMessageHandler
      );
      let received = Promise.resolve();
      socket.on('message', (rawMessage) => {
        received = received.then(async (): Promise<void> => {
          let rawEvent: unknown;
          try {
            rawEvent = JSON.parse(websocketPayloadToText(rawMessage));
          } catch {
            rawEvent = undefined;
          }

          for (const event of await connection.receive(rawEvent)) {
            socket.send(JSON.stringify(event));
          }
        }).catch(() => undefined);
      });
    });
  }

  await app.init();

  return app;
}
