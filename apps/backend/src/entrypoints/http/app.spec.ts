import '@fastify/websocket';
import {
  GuestSessionSchema,
  HealthStatusSchema,
  ReadinessStatusSchema
} from '@turni/contracts';
import { describe, expect, it } from 'vitest';
import type { RawData } from 'ws';
import type { ReadinessPort } from '../../platform/http/readiness.js';

import { DurableGuestSessionService } from '../../modules/channels/application/durable-guest-session.js';
import { GuestSessionService } from '../../modules/channels/application/guest-session.js';
import type { GuestSessionStorePort, GuestSessionStoreRecord } from '../../modules/channels/application/guest-session-store.port.js';
import { WidgetRoutingKeyService } from '../../modules/channels/application/widget-routing-key.js';
import { createHttpApp } from './app.js';
import { websocketPayloadToText } from './websocket-payload.js';

const sessionSecret = 'test-session-secret-that-is-long-enough-for-hmac';
const routingSecret = 'test-routing-secret-that-is-long-enough-for-hmac';

function durableFixture(): Readonly<{ service: DurableGuestSessionService; widgetKey: string }> {
  const routingKeys = new WidgetRoutingKeyService(routingSecret);
  const widgetKey = routingKeys.issue({
    tenantId: '01900000-0000-7000-8000-000000000010',
    agentId: '01900000-0000-7000-8000-000000000011',
    connectionId: '01900000-0000-7000-8000-000000000012',
    expiresAt: Math.floor(Date.now() / 1_000) + 3_600,
    kid: 'test'
  });
  const rows: GuestSessionStoreRecord[] = [];
  const store: GuestSessionStorePort = {
    insert: (row) => { rows.push(row); return Promise.resolve(); },
    findByTokenHash: ({ tenantId, tokenHash }) =>
      Promise.resolve(rows.find((row) => row.tenantId === tenantId && Buffer.from(row.tokenHash).equals(Buffer.from(tokenHash)))),
    revoke: () => Promise.resolve(true),
    markUsedByTokenHash: () => Promise.resolve(true)
  };
  return {
    service: new DurableGuestSessionService(
      new GuestSessionService(sessionSecret, routingKeys),
      store,
      { next: () => '01900000-0000-7000-8000-000000000013' }
    ),
    widgetKey
  };
}

describe('HTTP entrypoint', () => {
  it('returns a contract-valid health payload', async () => {
    const app = await createHttpApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(HealthStatusSchema.parse(response.json())).toEqual({ status: 'ok', service: 'turni-backend' });
    } finally { await app.close(); }
  });

  it('reports ready with a database check when no readiness port is composed', async () => {
    const app = await createHttpApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(200);
      expect(ReadinessStatusSchema.parse(response.json())).toEqual({
        status: 'ok',
        service: 'turni-backend',
        checks: { database: 'ok' }
      });
    } finally { await app.close(); }
  });

  it('reports ready with a 200 when the composed database check succeeds', async () => {
    const readiness: ReadinessPort = { ping: () => Promise.resolve() };
    const app = await createHttpApp({ readiness });
    try {
      const response = await app.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(200);
      expect(ReadinessStatusSchema.parse(response.json())).toEqual({
        status: 'ok',
        service: 'turni-backend',
        checks: { database: 'ok' }
      });
    } finally { await app.close(); }
  });

  it('reports 503 as an RFC 7807 problem when the database is unreachable', async () => {
    const readiness: ReadinessPort = { ping: () => Promise.reject(new Error('connection refused')) };
    const app = await createHttpApp({ readiness });
    try {
      const response = await app.inject({ method: 'GET', url: '/readyz' });
      expect(response.statusCode).toBe(503);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({
        status: 503,
        title: 'Service unavailable'
      });
    } finally { await app.close(); }
  });

  it('does not expose guest session routes without a composed durable service', async () => {
    const app = await createHttpApp();
    try {
      await expect(app.inject({ method: 'POST', url: '/api/v1/guest/sessions', payload: {} })).resolves.toMatchObject({ statusCode: 404 });
    } finally { await app.close(); }
  });

  it('rejects an invalid widget key through the durable boundary', async () => {
    const app = await createHttpApp({ guestSessionService: durableFixture().service });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/guest/sessions',
        payload: { widgetKey: 'widget_public_demo' }
      });
      expect(response.statusCode).toBe(400);
    } finally { await app.close(); }
  });

  it('issues and resumes a persisted guest session', async () => {
    const fixture = durableFixture();
    const app = await createHttpApp({ guestSessionService: fixture.service });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/v1/guest/sessions', payload: { widgetKey: fixture.widgetKey } });
      expect(response.statusCode).toBe(201);
      const session = GuestSessionSchema.parse(response.json());
      const socket = await app.getHttpAdapter().getInstance().injectWS('/api/v1/guest/chat');
      try {
        const received = new Promise<unknown>((resolve) => socket.once('message', (data) => resolve(JSON.parse(websocketPayloadToText(data)))));
        socket.send(JSON.stringify({ type: 'session.resume', token: session.token }));
        expect(await received).toEqual({ type: 'session.ok', token: session.token });
      } finally { socket.terminate(); }
    } finally { await app.close(); }
  });

  it('serializes a resume and message sent in the same socket turn', async () => {
    const fixture = durableFixture();
    const app = await createHttpApp({ guestSessionService: fixture.service });
    try {
      const sessionResponse = await app.inject({ method: 'POST', url: '/api/v1/guest/sessions', payload: { widgetKey: fixture.widgetKey } });
      const session = GuestSessionSchema.parse(sessionResponse.json());
      const socket = await app.getHttpAdapter().getInstance().injectWS('/api/v1/guest/chat');
      try {
        const events = new Promise<unknown[]>((resolve) => {
          const received: unknown[] = [];
          const receive = (data: RawData): void => {
            received.push(JSON.parse(websocketPayloadToText(data)));
            if (received.length === 3) resolve(received);
            else socket.once('message', receive);
          };
          socket.once('message', receive);
        });
        socket.send(JSON.stringify({ type: 'session.resume', token: session.token }));
        socket.send(JSON.stringify({ type: 'message.send', clientMsgId: '01900000-0000-7000-8000-000000000014', text: 'Здравствуйте' }));
        await expect(events).resolves.toEqual([
          { type: 'session.ok', token: session.token },
          expect.objectContaining({ type: 'message.new', role: 'guest', text: 'Здравствуйте' }),
          { type: 'status', kind: 'typing' }
        ]);
      } finally { socket.terminate(); }
    } finally { await app.close(); }
  });

  it('denies an unauthenticated cabinet event stream', async () => {
    const app = await createHttpApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/v1/streams/cabinet' });
      expect(response.statusCode).toBe(401);
    } finally { await app.close(); }
  });
});
