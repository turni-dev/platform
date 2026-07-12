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

export class WidgetChatConnection {
  private activeSession = false;
  private readonly receivedMessageIds = new Set<string>();

  constructor(private readonly sessions: GuestSessionService) {}

  receive(rawEvent: unknown, now = new Date()): readonly WidgetServerEvent[] {
    const parsedEvent = WidgetClientEventSchema.safeParse(rawEvent);
    if (!parsedEvent.success) {
      return [this.error(WidgetErrorCode.InvalidEvent)];
    }

    if (parsedEvent.data.type === WidgetClientEventType.SessionResume) {
      try {
        this.sessions.verify(parsedEvent.data.token, now);
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

    if (!this.activeSession) {
      return [this.error(WidgetErrorCode.InvalidSession)];
    }

    if (parsedEvent.data.type === WidgetClientEventType.Typing) {
      return [this.status(WidgetStatusKind.Typing)];
    }

    if (this.receivedMessageIds.has(parsedEvent.data.clientMsgId)) {
      return [];
    }

    this.receivedMessageIds.add(parsedEvent.data.clientMsgId);
    return [
      WidgetServerEventSchema.parse({
        type: WidgetServerEventType.MessageNew,
        id: parsedEvent.data.clientMsgId,
        role: WidgetMessageRole.Guest,
        text: parsedEvent.data.text,
        ts: now.toISOString()
      }),
      this.status('typing')
    ];
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
