import {
  WidgetClientEventSchema,
  WidgetClientEventType,
  WidgetServerEventSchema,
  type WidgetClientEvent,
  type WidgetServerEvent
} from '@turni/contracts';
import { ExponentialBackoff } from '../shared/backoff.js';

const OPEN_SOCKET_STATE = 1;
const RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 4_000;
const MAX_RECONNECT_ATTEMPTS = 3;

export interface WidgetSocket {
  readyState: number;
  onclose: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  close(): void;
  send(payload: string): void;
}

export interface WidgetTimer {
  clearTimeout(timerId: number): void;
  setTimeout(callback: () => void, delayMs: number): number;
}

export interface WidgetChatTransportOptions {
  sessionToken: string;
  timer?: WidgetTimer;
  url: string;
  webSocketFactory?: (url: string) => WidgetSocket;
}

export class WidgetChatTransport {
  private readonly listeners = new Set<(event: WidgetServerEvent) => void>();
  private readonly reconnectBackoff = new ExponentialBackoff({
    initialDelayMs: RECONNECT_DELAY_MS,
    maxDelayMs: MAX_RECONNECT_DELAY_MS,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    random: () => 0.5
  });
  private readonly timer: WidgetTimer;
  private readonly webSocketFactory: (url: string) => WidgetSocket;
  private readonly url: string;
  private queuedEvents: WidgetClientEvent[] = [];
  private reconnectTimerId: number | null = null;
  private sessionToken: string | null;
  private socket: WidgetSocket | null = null;

  public constructor(options: WidgetChatTransportOptions) {
    const sessionResume = WidgetClientEventSchema.safeParse({
      type: WidgetClientEventType.SessionResume,
      token: options.sessionToken
    });
    if (
      !sessionResume.success ||
      sessionResume.data.type !== WidgetClientEventType.SessionResume
    ) {
      throw new Error('A valid guest session token is required.');
    }

    this.sessionToken = sessionResume.data.token;
    this.timer = options.timer ?? window;
    this.url = options.url;
    this.webSocketFactory = options.webSocketFactory ?? createNativeSocket;
  }

  public connect(): void {
    if (this.sessionToken === null) {
      throw new Error('A fresh guest session is required before connecting.');
    }

    if (this.socket !== null) {
      return;
    }

    this.clearReconnectTimer();
    const socket = this.webSocketFactory(this.url);
    this.socket = socket;
    socket.onopen = () => this.handleOpen(socket);
    socket.onmessage = (event) => this.handleMessage(socket, event.data);
    socket.onclose = () => this.handleClose(socket);
  }

  public send(event: WidgetClientEvent): void {
    const parsedEvent = WidgetClientEventSchema.safeParse(event);
    if (!parsedEvent.success || parsedEvent.data.type === WidgetClientEventType.SessionResume) {
      return;
    }

    if (this.socket?.readyState === OPEN_SOCKET_STATE) {
      if (this.sendSocketEvent(this.socket, parsedEvent.data)) {
        return;
      }

      this.queuedEvents.push(parsedEvent.data);
      return;
    }

    this.queuedEvents.push(parsedEvent.data);
  }

  public subscribe(listener: (event: WidgetServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public disconnect(): void {
    this.clearReconnectTimer();
    this.queuedEvents = [];
    this.sessionToken = null;

    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimerId !== null) {
      this.timer.clearTimeout(this.reconnectTimerId);
      this.reconnectTimerId = null;
    }
  }

  private handleClose(socket: WidgetSocket): void {
    if (this.socket !== socket) {
      return;
    }

    this.socket = null;
    if (this.sessionToken === null) {
      return;
    }

    const delayMs = this.reconnectBackoff.nextDelay();
    if (delayMs === null) {
      return;
    }

    this.reconnectTimerId = this.timer.setTimeout(() => {
      this.reconnectTimerId = null;
      this.connect();
    }, delayMs);
  }

  private handleMessage(socket: WidgetSocket, payload: unknown): void {
    if (this.socket !== socket || this.sessionToken === null) {
      return;
    }

    if (typeof payload !== 'string') {
      return;
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payload) as unknown;
    } catch {
      return;
    }

    const event = WidgetServerEventSchema.safeParse(parsedPayload);
    if (!event.success) {
      return;
    }

    for (const listener of this.listeners) {
      listener(event.data);
    }
  }

  private handleOpen(socket: WidgetSocket): void {
    if (this.socket !== socket || this.sessionToken === null) {
      return;
    }

    this.reconnectBackoff.reset();

    const resumeEvent = WidgetClientEventSchema.safeParse({
      type: WidgetClientEventType.SessionResume,
      token: this.sessionToken
    });
    if (!resumeEvent.success) {
      return;
    }
    if (!this.sendSocketEvent(socket, resumeEvent.data)) {
      return;
    }

    while (this.queuedEvents.length > 0) {
      const event = this.queuedEvents[0];
      if (event === undefined || !this.sendSocketEvent(socket, event)) {
        return;
      }
      this.queuedEvents.shift();
    }
  }

  private sendSocketEvent(socket: WidgetSocket, event: WidgetClientEvent): boolean {
    try {
      socket.send(JSON.stringify(event));
      return true;
    } catch {
      this.handleClose(socket);
      try {
        socket.close();
      } catch {
        // A failed close must not expose payloads or interrupt reconnection.
      }
      return false;
    }
  }
}

function createNativeSocket(url: string): WidgetSocket {
  const nativeSocket = new WebSocket(url);
  const socket: WidgetSocket = {
    get readyState(): number {
      return nativeSocket.readyState;
    },
    onclose: null,
    onmessage: null,
    onopen: null,
    close: () => nativeSocket.close(),
    send: (payload) => nativeSocket.send(payload)
  };

  nativeSocket.onopen = () => socket.onopen?.();
  nativeSocket.onmessage = (event) => socket.onmessage?.({ data: event.data });
  nativeSocket.onclose = () => socket.onclose?.();

  return socket;
}
