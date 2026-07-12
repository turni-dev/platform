import '@fastify/websocket';
import { GuestSessionSchema, HealthStatusSchema } from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import { createHttpApp } from './app.js';
import { websocketPayloadToText } from './websocket-payload.js';

describe('HTTP entrypoint health checks', () => {
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
    const app = await createHttpApp({
      guestSessionSecret: 'test-session-secret-that-is-long-enough-for-hmac'
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: { widgetKey: 'widget_public_demo' }
      });

      expect(response.statusCode).toBe(201);
      expect(GuestSessionSchema.parse(response.json()).token.length).toBeGreaterThanOrEqual(32);
    } finally {
      await app.close();
    }
  });

  it('accepts a resumed guest session over WebSocket', async () => {
    const app = await createHttpApp({
      guestSessionSecret: 'test-session-secret-that-is-long-enough-for-hmac'
    });

    try {
      const sessionResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: { widgetKey: 'widget_public_demo' }
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
