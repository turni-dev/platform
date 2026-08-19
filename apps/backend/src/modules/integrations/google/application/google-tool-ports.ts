import { z } from 'zod';

/**
 * These two ports are deliberately narrow: no `deleteEvent`, no
 * `updateEvent`, no arbitrary-range Sheets write beyond an append. A bounded
 * surface is smaller to review and smaller to misuse from a
 * prompt-injected agent turn. Widening either port later is its own card.
 *
 * The DTOs below are the only shapes allowed to cross the port boundary —
 * adapters translate Google's wire shape (etag, iCalUID, majorDimension, ...)
 * into these and nothing else leaks past that translation.
 */

export const CalendarEventSchema = z.strictObject({
  id: z.string().min(1),
  summary: z.string(),
  startsAt: z.string(),
  endsAt: z.string()
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const ListUpcomingEventsInputSchema = z.strictObject({
  calendarId: z.string().min(1),
  maxResults: z.number().int().positive()
});

export type ListUpcomingEventsInput = z.infer<typeof ListUpcomingEventsInputSchema>;

export const CreateCalendarEventInputSchema = z.strictObject({
  calendarId: z.string().min(1),
  summary: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string()
});

export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventInputSchema>;

export const CreateCalendarEventResultSchema = z.strictObject({
  eventId: z.string().min(1)
});

export type CreateCalendarEventResult = z.infer<typeof CreateCalendarEventResultSchema>;

export interface GoogleCalendarToolPort {
  listUpcomingEvents(input: ListUpcomingEventsInput): Promise<readonly CalendarEvent[]>;
  createEvent(input: CreateCalendarEventInput): Promise<CreateCalendarEventResult>;
}

export const ReadSheetRangeInputSchema = z.strictObject({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1)
});

export type ReadSheetRangeInput = z.infer<typeof ReadSheetRangeInputSchema>;

export const SheetRangeValuesSchema = z.array(z.array(z.string()));

export type SheetRangeValues = z.infer<typeof SheetRangeValuesSchema>;

export const AppendSheetRowInputSchema = z.strictObject({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1),
  values: z.array(z.string()).min(1)
});

export type AppendSheetRowInput = z.infer<typeof AppendSheetRowInputSchema>;

export interface GoogleSheetsToolPort {
  readRange(input: ReadSheetRangeInput): Promise<readonly (readonly string[])[]>;
  appendRow(input: AppendSheetRowInput): Promise<void>;
}
