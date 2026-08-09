import {
  WidgetClientEventSchema,
  WidgetClientEventType,
  WidgetErrorCode,
  WidgetMessageRole,
  WidgetServerEventSchema,
  WidgetServerEventType,
  WidgetStatusKind,
  type WidgetServerEvent
} from '@turni/contracts';
import type { GuestSessionService } from './guest-session.js';
import type { GuestSessionContext, GuestSessionContextResolver } from './guest-session-context.js';

export type WidgetMessageHandler = (
  input: Readonly<{
    clientMsgId: string;
    text: string;
    receivedAt: Date;
    context: GuestSessionContext;
  }>
) => Promise<readonly WidgetServerEvent[]>;

export class WidgetChatConnection {
  private activeSession = false;
  private context: GuestSessionContext | undefined;
  private readonly receivedMessageIds = new Set<string>();

  constructor(
    private readonly sessions: GuestSessionService,
    private readonly handleMessage?: WidgetMessageHandler,
    private readonly contexts?: GuestSessionContextResolver
  ) {}

  async receive(rawEvent: unknown, now = new Date()): Promise<readonly WidgetServerEvent[]> {
    const parsedEvent = WidgetClientEventSchema.safeParse(rawEvent);
    if (!parsedEvent.success) {
      return [this.error(WidgetErrorCode.InvalidEvent)];
    }

    if (parsedEvent.data.type === WidgetClientEventType.SessionResume) {
      try {
        const routing = this.sessions.verify(parsedEvent.data.token, now);
        if (this.contexts === undefined) throw new Error('Missing session context resolver.');
        const context = await this.contexts.resolve(routing.widgetKey);
        if (context.tenantId !== routing.tenantId || context.agentId !== routing.agentId || context.connectionId !== routing.connectionId) throw new Error('Invalid session context.');
        this.context = Object.freeze(context);
        this.activeSession = true;
        return [
          WidgetServerEventSchema.parse({
            type: WidgetServerEventType.SessionOk,
            token: parsedEvent.data.token
          })
        ];
      } catch {
        return [this.error(WidgetErrorCode.InvalidSession)];
      }
    }

    if (!this.activeSession || this.context === undefined) {
      return [this.error(WidgetErrorCode.InvalidSession)];
    }

    if (parsedEvent.data.type === WidgetClientEventType.Typing) {
      return [this.status(WidgetStatusKind.Typing)];
    }

    if (this.receivedMessageIds.has(parsedEvent.data.clientMsgId)) {
      return [];
    }

    this.receivedMessageIds.add(parsedEvent.data.clientMsgId);
    const acceptedEvents: readonly WidgetServerEvent[] = [
      WidgetServerEventSchema.parse({
        type: WidgetServerEventType.MessageNew,
        id: parsedEvent.data.clientMsgId,
        role: WidgetMessageRole.Guest,
        text: parsedEvent.data.text,
        ts: now.toISOString()
      }),
      this.status('typing')
    ];

    if (this.handleMessage === undefined) {
      return acceptedEvents;
    }

    try {
      const completedEvents = WidgetServerEventSchema.array().parse(
        await this.handleMessage({
          clientMsgId: parsedEvent.data.clientMsgId,
          text: parsedEvent.data.text,
          receivedAt: now,
          context: this.context
        })
      );
      return [...acceptedEvents, ...completedEvents];
    } catch {
      return acceptedEvents;
    }
  }

  private error(
    code: (typeof WidgetErrorCode)['InvalidEvent' | 'InvalidSession']
  ): WidgetServerEvent {
    return WidgetServerEventSchema.parse({ type: WidgetServerEventType.Error, code });
  }

  private status(kind: (typeof WidgetStatusKind)['Typing']): WidgetServerEvent {
    return WidgetServerEventSchema.parse({ type: WidgetServerEventType.Status, kind });
  }
}
