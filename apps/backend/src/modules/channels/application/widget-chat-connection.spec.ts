import { describe, expect, it } from 'vitest';
import { GuestSessionService } from './guest-session.js';
import { WidgetChatConnection } from './widget-chat-connection.js';

const secret = 'test-session-secret-that-is-long-enough-for-hmac';
const now = new Date('2026-07-12T12:00:00.000Z');

describe('WidgetChatConnection', () => {
  it('requires a valid resumed guest session before a message is accepted', () => {
    const connection = new WidgetChatConnection(new GuestSessionService(secret));

    expect(
      connection.receive(
        {
          type: 'message.send',
          clientMsgId: '01900000-0000-7000-8000-000000000001',
          text: 'Можно забронировать стол?'
        },
        now
      )
    ).toEqual([{ type: 'error', code: 'invalid_session' }]);
  });

  it('emits a complete guest message once after session resume', () => {
    const sessions = new GuestSessionService(secret);
    const session = sessions.issue({ widgetKey: 'widget_public_demo' }, now);
    const connection = new WidgetChatConnection(sessions);

    expect(connection.receive({ type: 'session.resume', token: session.token }, now)).toEqual([
      { type: 'session.ok', token: session.token }
    ]);

    const message = {
      type: 'message.send' as const,
      clientMsgId: '01900000-0000-7000-8000-000000000002',
      text: 'Можно забронировать стол?'
    };

    expect(connection.receive(message, now)).toEqual([
      {
        type: 'message.new',
        id: '01900000-0000-7000-8000-000000000002',
        role: 'guest',
        text: 'Можно забронировать стол?',
        ts: '2026-07-12T12:00:00.000Z'
      },
      { type: 'status', kind: 'typing' }
    ]);
    expect(connection.receive(message, now)).toEqual([]);
  });
});
