import '@fastify/websocket';
import { GuestSessionSchema, HealthStatusSchema } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import { createHttpApp } from './app.js';
import { websocketPayloadToText } from './websocket-payload.js';
import { WidgetRoutingKeyService } from '../../modules/channels/application/widget-routing-key.js';
import { FakeGuestSessionContextResolver } from '../../modules/channels/application/guest-session-context.js';

const sessionSecret = 'test-session-secret-that-is-long-enough-for-hmac';
const routingSecret = 'test-routing-secret-that-is-long-enough-for-hmac';

function routingFixture(): Readonly<{
  widgetKey: string;
  context: Readonly<{
    tenantId: string;
    agentId: string;
    connectionId: string;
    sessionId: string;
  }>;
}> {
  const claims = {
    tenantId: '01900000-0000-7000-8000-000000000010',
    agentId: '01900000-0000-7000-8000-000000000011',
    connectionId: '01900000-0000-7000-8000-000000000012',
    expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
    kid: 'test'
  };
  return {
    widgetKey: new WidgetRoutingKeyService(routingSecret).issue(claims),
    context: {
      tenantId: claims.tenantId,
      agentId: claims.agentId,
      connectionId: claims.connectionId,
      sessionId: '01900000-0000-7000-8000-000000000013'
    }
  };
}

describe('HTTP entrypoint health checks', () => {
  it('requires a separate sufficiently long widget routing secret for guest sessions', async () => {
    await expect(createHttpApp({ guestSessionSecret: sessionSecret })).rejects.toThrow();
    await expect(
      createHttpApp({
        guestSessionSecret: sessionSecret,
        widgetRoutingSecret: 'too-short'
      })
    ).rejects.toThrow();
    await expect(
      createHttpApp({
        guestSessionSecret: sessionSecret,
        widgetRoutingSecret: sessionSecret,
        guestSessionContextResolver: new FakeGuestSessionContextResolver({})
      })
    ).rejects.toThrow();
    await expect(
      createHttpApp({
        guestSessionSecret: sessionSecret,
        widgetRoutingSecret: routingSecret
      })
    ).rejects.toThrow();
  });

  it('returns a contract-valid health payload', async () => {
    const app = await createHttpApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/healthz'
      });

      expect(response.statusCode).toBe(200);
      expect(HealthStatusSchema.parse(response.json())).toEqual({
        status: 'ok',
        service: 'turni-backend'
      });
    } finally {
      await app.close();
    }
  }, 10_000);

  it('creates a contract-valid guest session for a widget', async () => {
    const routing = routingFixture();
    const app = await createHttpApp({
      guestSessionSecret: sessionSecret,
      widgetRoutingSecret: routingSecret,
      guestSessionContextResolver: new FakeGuestSessionContextResolver({
        [routing.widgetKey]: routing.context
      })
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: { widgetKey: routing.widgetKey }
      });

      expect(response.statusCode).toBe(201);
      expect(GuestSessionSchema.parse(response.json()).token.length).toBeGreaterThanOrEqual(32);
    } finally {
      await app.close();
    }
  });

  it('rejects an unsigned widget routing key as an invalid request', async () => {
    const app = await createHttpApp({
      guestSessionSecret: sessionSecret,
      widgetRoutingSecret: routingSecret,
      guestSessionContextResolver: new FakeGuestSessionContextResolver({})
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: { widgetKey: 'widget_public_demo' }
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('accepts a resumed guest session over WebSocket', async () => {
    const routing = routingFixture();
    const app = await createHttpApp({
      guestSessionSecret: sessionSecret,
      widgetRoutingSecret: routingSecret,
      guestSessionContextResolver: new FakeGuestSessionContextResolver({
        [routing.widgetKey]: routing.context
      })
    });

    try {
      const sessionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: { widgetKey: routing.widgetKey }
      });
      const session = GuestSessionSchema.parse(sessionResponse.json());
      const fastify = app.getHttpAdapter().getInstance();

      expect(typeof fastify.injectWS).toBe('function');
      const socket = await fastify.injectWS('/api/v1/guest/chat');
      try {
        const received = new Promise<unknown>((resolve) => {
          socket.once('message', (data) => {
            resolve(JSON.parse(websocketPayloadToText(data)));
          });
        });

        socket.send(JSON.stringify({ type: 'session.resume', token: session.token }));

        expect(await received).toEqual({ type: 'session.ok', token: session.token });
      } finally {
        socket.terminate();
      }
    } finally {
      await app.close();
    }
  });

  it('rejects guest-session composition without a context resolver', async () => {
    await expect(
      createHttpApp({
        guestSessionSecret: sessionSecret,
        widgetRoutingSecret: routingSecret
      })
    ).rejects.toThrow('Guest session context resolver is required');
  });

  it('denies an unauthenticated cabinet event stream', async () => {
    const app = await createHttpApp();

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/streams/cabinet'
      });

      expect(response.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});
