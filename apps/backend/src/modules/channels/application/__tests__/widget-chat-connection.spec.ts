import { describe, expect, it } from 'vitest';
import { DurableGuestSessionService } from '../durable-guest-session.js';
import { GuestSessionService } from '../guest-session.js';
import type { GuestSessionStorePort, GuestSessionStoreRecord } from '../guest-session-store.port.js';
import { WidgetRoutingKeyService } from '../widget-routing-key.js';
import {
  WidgetChatConnection,
  type WidgetMessageHandler
} from '../widget-chat-connection.js';

const secret = 'test-session-secret-that-is-long-enough-for-hmac';
const now = new Date('2026-07-12T12:00:00.000Z');

function durableFixture(): Readonly<{ service: DurableGuestSessionService; widgetKey: string }> {
  const routingKeys = new WidgetRoutingKeyService(secret);
  const widgetKey = routingKeys.issue({
    tenantId: '01900000-0000-7000-8000-000000000010',
    agentId: '01900000-0000-7000-8000-000000000011',
    connectionId: '01900000-0000-7000-8000-000000000012',
    expiresAt: 1_900_000_000,
    kid: 'primary'
  });
  const rows: GuestSessionStoreRecord[] = [];
  const store: GuestSessionStorePort = {
    insert: (row) => {
      rows.push(row);
      return Promise.resolve();
    },
    findByTokenHash: ({ tenantId, tokenHash }) =>
      Promise.resolve(rows.find((row) => row.tenantId === tenantId && Buffer.from(row.tokenHash).equals(Buffer.from(tokenHash)))),
    revoke: () => Promise.resolve(true),
    markUsedByTokenHash: () => Promise.resolve(true)
  };
  return {
    service: new DurableGuestSessionService(
      new GuestSessionService(secret, routingKeys),
      store,
      { next: () => '01900000-0000-7000-8000-000000000013' }
    ),
    widgetKey
  };
}

describe('WidgetChatConnection', () => {
  it('requires a valid resumed guest session before a message is accepted', async () => {
    const connection = new WidgetChatConnection(durableFixture().service);

    await expect(
      connection.receive(
        {
          type: 'message.send',
          clientMsgId: '01900000-0000-7000-8000-000000000001',
          text: 'Можно забронировать стол?'
        },
        now
      )
    ).resolves.toEqual([{ type: 'error', code: 'invalid_session' }]);
  });

  it('appends a completed agent reply only after an accepted guest message', async () => {
    const fixture = durableFixture();
    const session = await fixture.service.issue({ widgetKey: fixture.widgetKey }, now);
    const handledMessages: unknown[] = [];
    const handler: WidgetMessageHandler = (message) => {
      handledMessages.push(message);
      return Promise.resolve([
        {
          id: '01900000-0000-7000-8000-000000000003',
          type: 'message.new',
          role: 'agent',
          text: 'Да, подскажите удобное время.',
          ts: '2026-07-12T12:00:01.000Z'
        }
      ]);
    };
    const connection = new WidgetChatConnection(fixture.service, handler);

    await expect(connection.receive({ type: 'session.resume', token: session.token }, now)).resolves.toEqual([
      { type: 'session.ok', token: session.token }
    ]);

    const message = {
      type: 'message.send' as const,
      clientMsgId: '01900000-0000-7000-8000-000000000002',
      text: 'Можно забронировать стол?'
    };

    await expect(connection.receive(message, now)).resolves.toEqual([
      {
        type: 'message.new',
        id: '01900000-0000-7000-8000-000000000002',
        role: 'guest',
        text: 'Можно забронировать стол?',
        ts: '2026-07-12T12:00:00.000Z'
      },
      { type: 'status', kind: 'typing' },
      {
        type: 'message.new',
        id: '01900000-0000-7000-8000-000000000003',
        role: 'agent',
        text: 'Да, подскажите удобное время.',
        ts: '2026-07-12T12:00:01.000Z'
      }
    ]);
    expect(handledMessages).toEqual([
      {
        clientMsgId: '01900000-0000-7000-8000-000000000002',
          text: 'Можно забронировать стол?',
          receivedAt: now,
          context: { tenantId: '01900000-0000-7000-8000-000000000010', agentId: '01900000-0000-7000-8000-000000000011', connectionId: '01900000-0000-7000-8000-000000000012', sessionId: '01900000-0000-7000-8000-000000000013' }
      }
    ]);
    await expect(connection.receive(message, now)).resolves.toEqual([]);
  });
});
