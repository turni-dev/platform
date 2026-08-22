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
import { registerProblemErrorHandler } from '../../platform/http/problem-error-handler.js';
import { sendProblem } from '../../platform/http/problem-details.js';
import type { ReadinessPort } from '../../platform/http/readiness.js';
import { registerAgentRoutes, type AgentHttpOptions } from './agent-routes.js';
import { registerChannelRoutes, type ChannelHttpOptions } from './channel-routes.js';
import {
  registerGoogleIntegrationRoutes,
  type GoogleIntegrationHttpOptions
} from './google-integration-routes.js';
import {
  registerVkWebhookRoutes,
  type VkWebhookHttpOptions
} from './vk-webhook-routes.js';
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
  Ready: '/readyz',
  GuestSessions: '/api/v1/guest/sessions',
  GuestChat: '/api/v1/guest/chat',
  CabinetStream: '/api/v1/streams/cabinet'
} as const;

class HttpAppModule {}

Module({})(HttpAppModule);

export type HttpAppOptions = Readonly<{
  ownerAuth?: OwnerAuthHttpOptions;
  agent?: AgentHttpOptions;
  channels?: ChannelHttpOptions;
  vkWebhook?: VkWebhookHttpOptions;
  google?: GoogleIntegrationHttpOptions;
  guestSessionService?: DurableGuestSessionService;
  widgetMessageHandler?: WidgetMessageHandler;
  cabinetStream?: CabinetStream;
  authorizeCabinetStream?: (request: FastifyRequest) => boolean;
  /** Backs `/readyz`. Without it, `/readyz` reports the process healthy but
   * checks no dependency — only `/healthz` is guaranteed to exist. */
  readiness?: ReadinessPort;
}>;

export async function createHttpApp(
  options?: HttpAppOptions
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    HttpAppModule,
    new FastifyAdapter({
      logger: false,
      // A signed webhook routing key is longer than the 100-character default,
      // and a route parameter over the limit is answered 404 rather than
      // refused — a silent way to lose every provider callback.
      maxParamLength: 512
    }),
    {
      logger: false
    }
  );

  const fastify = app.getHttpAdapter().getInstance();
  const cabinetStream = options?.cabinetStream ?? new CabinetStream();
  const authorizeCabinetStream = options?.authorizeCabinetStream ?? (() => false);
  await fastify.register(fastifyWebsocket);
  registerProblemErrorHandler(fastify);
  fastify.get(HttpRoute.Health, () => healthStatus);
  fastify.get(HttpRoute.Ready, async (_request, reply) => {
    if (options?.readiness === undefined) {
      return reply.send({ status: 'ok', service: 'turni-backend', checks: { database: 'ok' } });
    }

    try {
      await options.readiness.ping();

      return reply.send({ status: 'ok', service: 'turni-backend', checks: { database: 'ok' } });
    } catch (error) {
      console.error('Readiness check failed', error);

      return sendProblem(reply, {
        type: ProblemType.InvalidRequest,
        title: 'Service unavailable',
        status: 503,
        detail: 'The database is not reachable.',
        instance: HttpRoute.Ready
      });
    }
  });

  if (options?.ownerAuth !== undefined) {
    registerOwnerAuthRoutes(fastify, options.ownerAuth);
  }

  if (options?.agent !== undefined) {
    registerAgentRoutes(fastify, options.agent);
  }

  if (options?.channels !== undefined) {
    registerChannelRoutes(fastify, options.channels);
  }

  if (options?.vkWebhook !== undefined) {
    registerVkWebhookRoutes(fastify, options.vkWebhook);
  }

  if (options?.google !== undefined) {
    registerGoogleIntegrationRoutes(fastify, options.google);
  }

  fastify.get(HttpRoute.CabinetStream, (request, reply) => {
    if (!authorizeCabinetStream(request)) {
      return sendProblem(reply, {
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
        return sendProblem(reply, {
          type: ProblemType.InvalidRequest,
          title: 'Invalid request',
          status: 400
        });
      }

      try {
        return reply.code(201).send(await guestSessions.issue(parsedRequest.data));
      } catch {
        return sendProblem(reply, {
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
