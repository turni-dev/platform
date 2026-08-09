import {
  WidgetClientEventSchema,
  WidgetClientEventType,
  WidgetMessageRole,
  WidgetServerEventType,
  type WidgetServerEvent
} from '@turni/contracts';
import { describe, expect, it } from 'vitest';

import {
  WidgetChatTransport,
  type WidgetSocket,
  type WidgetTimer
} from './widget-chat-transport.js';

const SESSION_TOKEN = 'a'.repeat(32);
const MESSAGE_ID = '018f8d7e-5f1a-7c1f-8f38-2b325d59d19e';

class FakeSocket implements WidgetSocket {
  public readyState = 0;
  public onclose: (() => void) | null = null;
  public onmessage: ((event: { data: unknown }) => void) | null = null;
  public onopen: (() => void) | null = null;
  public readonly sent: string[] = [];

  public close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  public open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  public receive(event: unknown): void {
    this.onmessage?.({ data: JSON.stringify(event) });
  }

  public send(payload: string): void {
    this.sent.push(payload);
  }
}

class FakeTimer implements WidgetTimer {
  public delayMs: number | null = null;
  private callback: (() => void) | null = null;

  public clearTimeout(): void {
    this.callback = null;
  }

  public setTimeout(callback: () => void, delayMs: number): number {
    this.callback = callback;
    this.delayMs = delayMs;
    return 1;
  }

  public run(): void {
    const callback = this.callback;
    this.callback = null;
    this.delayMs = null;
    callback?.();
  }
}

function createTransport(timer = new FakeTimer()): {
  transport: WidgetChatTransport;
  sockets: FakeSocket[];
  timer: FakeTimer;
} {
  const sockets: FakeSocket[] = [];
  const transport = new WidgetChatTransport({
    sessionToken: SESSION_TOKEN,
    timer,
    url: 'wss://chat.turni.test/api/v1/guest/chat',
    webSocketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    }
  });

  return { transport, sockets, timer };
}

describe('WidgetChatTransport', () => {
  it('resumes the session and flushes temporary messages when the socket opens', () => {
    const { transport, sockets } = createTransport();

    transport.connect();
    transport.send({ type: 'message.send', clientMsgId: MESSAGE_ID, text: 'Здравствуйте' });
    sockets[0]?.open();

    expect(sockets[0]?.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'session.resume', token: SESSION_TOKEN },
      { type: 'message.send', clientMsgId: MESSAGE_ID, text: 'Здравствуйте' }
    ]);
  });

  it('emits only server events that satisfy the shared contract', () => {
    const { transport, sockets } = createTransport();
    const received: WidgetServerEvent[] = [];
    transport.subscribe((event) => received.push(event));

    transport.connect();
    sockets[0]?.open();
    sockets[0]?.receive({
      type: WidgetServerEventType.MessageNew,
      id: MESSAGE_ID,
      role: WidgetMessageRole.Agent,
      text: 'Чем могу помочь?',
      ts: '2026-08-03T12:00:00.000Z'
    });
    sockets[0]?.receive({ type: 'message.new', text: '<script>alert(1)</script>' });

    expect(received).toEqual([
      {
        type: WidgetServerEventType.MessageNew,
        id: MESSAGE_ID,
        role: WidgetMessageRole.Agent,
        text: 'Чем могу помочь?',
        ts: '2026-08-03T12:00:00.000Z'
      }
    ]);
  });

  it('reconnects with a bounded delay after an unexpected close', () => {
    const { transport, sockets, timer } = createTransport();

    transport.connect();
    sockets[0]?.open();
    sockets[0]?.close();

    expect(timer.delayMs).toBe(500);
    timer.run();
    expect(sockets).toHaveLength(2);
  });

  it('clears the token and queued guest text when explicitly disconnected', () => {
    const { transport, sockets, timer } = createTransport();

    transport.connect();
    transport.send({ type: 'message.send', clientMsgId: MESSAGE_ID, text: 'Не хранить' });
    transport.disconnect();

    expect(sockets[0]?.readyState).toBe(3);
    expect(timer.delayMs).toBeNull();
    expect(() => transport.connect()).toThrow('fresh guest session');
  });

  it('drops non-string and malformed socket payloads', () => {
    const { transport, sockets } = createTransport();
    const received: WidgetServerEvent[] = [];
    transport.subscribe((event) => received.push(event));
    transport.connect();
    sockets[0]?.open();
    sockets[0]?.onmessage?.({ data: { type: 'message.new' } });
    sockets[0]?.onmessage?.({ data: '{' });

    expect(received).toEqual([]);
  });

  it('drops a stale message after explicit disconnect', () => {
    const { transport, sockets } = createTransport();
    const received: WidgetServerEvent[] = [];
    transport.subscribe((event) => received.push(event));

    transport.connect();
    sockets[0]?.open();
    transport.disconnect();
    sockets[0]?.receive({
      type: WidgetServerEventType.MessageNew,
      id: MESSAGE_ID,
      role: WidgetMessageRole.Agent,
      text: 'Устаревшее сообщение',
      ts: '2026-08-03T12:00:00.000Z'
    });

    expect(received).toEqual([]);
  });

  it('drops messages received from a socket replaced during reconnect', () => {
    const { transport, sockets, timer } = createTransport();
    const received: WidgetServerEvent[] = [];
    transport.subscribe((event) => received.push(event));

    transport.connect();
    sockets[0]?.open();
    sockets[0]?.close();
    timer.run();
    sockets[0]?.receive({
      type: WidgetServerEventType.MessageNew,
      id: MESSAGE_ID,
      role: WidgetMessageRole.Agent,
      text: 'Сообщение старого сокета',
      ts: '2026-08-03T12:00:00.000Z'
    });

    expect(received).toEqual([]);
  });

  it('stops reconnecting after its retry budget is exhausted', () => {
    const { transport, sockets, timer } = createTransport();

    transport.connect();
    sockets[0]?.close();
    timer.run();
    sockets[1]?.close();
    timer.run();
    sockets[2]?.close();
    timer.run();
    sockets[3]?.close();
    timer.run();

    expect(sockets).toHaveLength(4);
  });

  it('resets reconnect attempts after a successful socket open', () => {
    const { transport, sockets, timer } = createTransport();

    transport.connect();
    sockets[0]?.close();
    timer.run();
    sockets[1]?.close();
    timer.run();
    sockets[2]?.open();
    sockets[2]?.close();

    expect(timer.delayMs).toBe(500);
  });

  it('rejects an invalid guest session token at construction', () => {
    expect(
      () =>
        new WidgetChatTransport({
          sessionToken: 'too-short',
          timer: new FakeTimer(),
          url: 'wss://chat.turni.test/api/v1/guest/chat',
          webSocketFactory: () => new FakeSocket()
        })
    ).toThrow('valid guest session token');
  });

  it('reconnects and preserves queued events when resume sending throws', () => {
    const { transport, sockets, timer } = createTransport();

    transport.connect();
    transport.send({ type: 'message.send', clientMsgId: MESSAGE_ID, text: 'Повторить после resume' });
    const firstSocket = sockets[0];
    if (firstSocket === undefined) {
      throw new Error('Expected the initial socket.');
    }
    firstSocket.send = () => {
      throw new Error('Socket send failed.');
    };

    expect(() => firstSocket.open()).not.toThrow();
    expect(timer.delayMs).toBe(500);
    timer.run();
    sockets[1]?.open();

    expect(sockets[1]?.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'session.resume', token: SESSION_TOKEN },
      { type: 'message.send', clientMsgId: MESSAGE_ID, text: 'Повторить после resume' }
    ]);
  });

  it('reconnects and queues a valid event when an open socket send throws', () => {
    const { transport, sockets, timer } = createTransport();

    transport.connect();
    sockets[0]?.open();
    const firstSocket = sockets[0];
    if (firstSocket === undefined) {
      throw new Error('Expected the initial socket.');
    }
    firstSocket.send = () => {
      throw new Error('Socket send failed.');
    };

    expect(() =>
      transport.send({ type: 'message.send', clientMsgId: MESSAGE_ID, text: 'Повторить после ошибки' })
    ).not.toThrow();
    expect(timer.delayMs).toBe(500);
    timer.run();
    sockets[1]?.open();

    expect(sockets[1]?.sent.map((payload) => JSON.parse(payload))).toEqual([
      { type: 'session.resume', token: SESSION_TOKEN },
      { type: 'message.send', clientMsgId: MESSAGE_ID, text: 'Повторить после ошибки' }
    ]);
  });

  it('does not treat a non-resume client event as a session credential', () => {
    const event = WidgetClientEventSchema.safeParse({ type: WidgetClientEventType.Typing });

    expect(event.success && event.data.type === WidgetClientEventType.SessionResume).toBe(false);
  });
});
