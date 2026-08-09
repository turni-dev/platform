import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common.js';

const WidgetKeySchema = z.string().trim().min(1).max(1024);
const GuestSessionTokenSchema = z.string().min(32).max(2048);
const MessageTextSchema = z.string().trim().min(1).max(4000);

export const WidgetClientEventType = {
  MessageSend: 'message.send',
  Typing: 'typing',
  SessionResume: 'session.resume'
} as const;

export const WidgetServerEventType = {
  MessageNew: 'message.new',
  Status: 'status',
  SessionOk: 'session.ok',
  Error: 'error'
} as const;

export const WidgetMessageRole = {
  Guest: 'guest',
  Agent: 'agent'
} as const;

export const WidgetStatusKind = {
  Typing: 'typing',
  WaitingApproval: 'waiting_approval',
  QuietHours: 'quiet_hours'
} as const;

export const WidgetErrorCode = {
  InvalidEvent: 'invalid_event',
  InvalidSession: 'invalid_session',
  RateLimited: 'rate_limited'
} as const;

export const CabinetStreamEventType = {
  DraftDelta: 'draft.delta',
  ApprovalCreated: 'approval.created',
  ApprovalUpdated: 'approval.updated',
  ConversationUpdated: 'conversation.updated',
  BookingCreated: 'booking.created',
  ReportReady: 'report.ready'
} as const;

export const GuestSessionRequestSchema = z.strictObject({
  widgetKey: WidgetKeySchema
});

export const GuestSessionSchema = z.strictObject({
  token: GuestSessionTokenSchema,
  expiresAt: IsoDateTimeSchema
});

export const WidgetClientEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(WidgetClientEventType.MessageSend),
    clientMsgId: UuidSchema,
    text: MessageTextSchema
  }),
  z.strictObject({
    type: z.literal(WidgetClientEventType.Typing)
  }),
  z.strictObject({
    type: z.literal(WidgetClientEventType.SessionResume),
    token: GuestSessionTokenSchema
  })
]);

export const WidgetServerEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(WidgetServerEventType.MessageNew),
    id: UuidSchema,
    role: z.enum([WidgetMessageRole.Guest, WidgetMessageRole.Agent]),
    text: MessageTextSchema,
    ts: IsoDateTimeSchema
  }),
  z.strictObject({
    type: z.literal(WidgetServerEventType.Status),
    kind: z.enum([
      WidgetStatusKind.Typing,
      WidgetStatusKind.WaitingApproval,
      WidgetStatusKind.QuietHours
    ]),
    etaSeconds: z.number().int().positive().max(600).optional()
  }),
  z.strictObject({
    type: z.literal(WidgetServerEventType.SessionOk),
    token: GuestSessionTokenSchema
  }),
  z.strictObject({
    type: z.literal(WidgetServerEventType.Error),
    code: z.enum([
      WidgetErrorCode.InvalidEvent,
      WidgetErrorCode.InvalidSession,
      WidgetErrorCode.RateLimited
    ])
  })
]);

export const CabinetStreamEventSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(CabinetStreamEventType.DraftDelta),
    runId: UuidSchema,
    chunk: z.string().min(1).max(4000)
  }),
  z.strictObject({
    type: z.literal(CabinetStreamEventType.ApprovalCreated),
    approvalId: UuidSchema
  }),
  z.strictObject({
    type: z.literal(CabinetStreamEventType.ApprovalUpdated),
    approvalId: UuidSchema
  }),
  z.strictObject({
    type: z.literal(CabinetStreamEventType.ConversationUpdated),
    conversationId: UuidSchema
  }),
  z.strictObject({
    type: z.literal(CabinetStreamEventType.BookingCreated),
    bookingId: UuidSchema
  }),
  z.strictObject({
    type: z.literal(CabinetStreamEventType.ReportReady),
    reportId: UuidSchema
  })
]);

export type GuestSessionRequest = z.infer<typeof GuestSessionRequestSchema>;
export type GuestSession = z.infer<typeof GuestSessionSchema>;
export type WidgetClientEvent = z.infer<typeof WidgetClientEventSchema>;
export type WidgetServerEvent = z.infer<typeof WidgetServerEventSchema>;
export type CabinetStreamEvent = z.infer<typeof CabinetStreamEventSchema>;
