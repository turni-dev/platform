import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common.js';

export const ProvisionBotRequestSchema = z.strictObject({
  tenantId: UuidSchema,
  agentId: UuidSchema
});
export const ProvisionedConnectionSchema = z.strictObject({
  connectionId: UuidSchema,
  type: z.literal('telegram'),
  status: z.enum(['pending', 'active']),
  identity: z.string().min(1).optional()
});

export type ProvisionBotRequest = z.infer<typeof ProvisionBotRequestSchema>;
export type ProvisionedConnection = z.infer<
  typeof ProvisionedConnectionSchema
>;

export interface BotProvisionerPort {
  provision(request: ProvisionBotRequest): Promise<ProvisionedConnection>;
}

export const AvailabilityRequestSchema = z.strictObject({
  tenantId: UuidSchema,
  locationId: UuidSchema,
  at: IsoDateTimeSchema,
  partySize: z.number().int().positive()
});
export const AvailabilitySchema = z.strictObject({
  available: z.boolean(),
  remainingCapacity: z.number().int().nonnegative().optional()
});
export const CreateBookingRequestSchema = AvailabilityRequestSchema.extend({
  idempotencyKey: z.string().min(1),
  guestId: UuidSchema,
  conversationId: UuidSchema.optional(),
  note: z.string().optional()
});
export const BookingSchema = z.strictObject({
  id: UuidSchema,
  status: z.enum([
    'requested',
    'confirmed',
    'seated',
    'no_show',
    'cancelled'
  ]),
  at: IsoDateTimeSchema,
  partySize: z.number().int().positive()
});
export const KnowledgeSyncRequestSchema = z.strictObject({
  tenantId: UuidSchema,
  locationId: UuidSchema,
  since: IsoDateTimeSchema.optional()
});
export const KnowledgeDocumentSchema = z.strictObject({
  path: z.string().min(1),
  content: z.string(),
  sourceVersion: z.string().min(1)
});

export type AvailabilityRequest = z.infer<typeof AvailabilityRequestSchema>;
export type Availability = z.infer<typeof AvailabilitySchema>;
export type CreateBookingRequest = z.infer<
  typeof CreateBookingRequestSchema
>;
export type Booking = z.infer<typeof BookingSchema>;
export type KnowledgeSyncRequest = z.infer<
  typeof KnowledgeSyncRequestSchema
>;
export type KnowledgeDocument = z.infer<typeof KnowledgeDocumentSchema>;

export interface BookingSystemPort {
  checkAvailability(request: AvailabilityRequest): Promise<Availability>;
  createBooking(request: CreateBookingRequest): Promise<Booking>;
  syncMenu(request: KnowledgeSyncRequest): Promise<readonly KnowledgeDocument[]>;
  syncStopList(
    request: KnowledgeSyncRequest
  ): Promise<readonly KnowledgeDocument[]>;
}

export const FreeBusyRequestSchema = z.strictObject({
  calendarId: z.string().min(1),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema
});
export const BusyIntervalSchema = z.strictObject({
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema
});
export const CalendarEventRequestSchema = z.strictObject({
  calendarId: z.string().min(1),
  title: z.string().min(1),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema,
  description: z.string().optional()
});
export const CalendarEventSchema = z.strictObject({
  id: z.string().min(1),
  startsAt: IsoDateTimeSchema,
  endsAt: IsoDateTimeSchema
});

export type FreeBusyRequest = z.infer<typeof FreeBusyRequestSchema>;
export type BusyInterval = z.infer<typeof BusyIntervalSchema>;
export type CalendarEventRequest = z.infer<typeof CalendarEventRequestSchema>;
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export interface CalendarPort {
  freeBusy(request: FreeBusyRequest): Promise<readonly BusyInterval[]>;
  createEvent(request: CalendarEventRequest): Promise<CalendarEvent>;
}

export const SpeechToTextRequestSchema = z.strictObject({
  audio: z.instanceof(Uint8Array),
  contentType: z.string().min(1),
  language: z.string().min(2).optional()
});
export const SpeechToTextResultSchema = z.strictObject({
  text: z.string(),
  language: z.string().min(2)
});
export const TextToSpeechRequestSchema = z.strictObject({
  text: z.string().min(1),
  language: z.string().min(2),
  voice: z.string().min(1).optional()
});
export const SpeechAudioSchema = z.strictObject({
  audio: z.instanceof(Uint8Array),
  contentType: z.string().min(1)
});

export type SpeechToTextRequest = z.infer<typeof SpeechToTextRequestSchema>;
export type SpeechToTextResult = z.infer<typeof SpeechToTextResultSchema>;
export type TextToSpeechRequest = z.infer<typeof TextToSpeechRequestSchema>;
export type SpeechAudio = z.infer<typeof SpeechAudioSchema>;

export interface SpeechPort {
  speechToText(request: SpeechToTextRequest): Promise<SpeechToTextResult>;
  textToSpeech(request: TextToSpeechRequest): Promise<SpeechAudio>;
}
