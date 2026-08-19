import { z } from 'zod';

/**
 * These two ports are deliberately narrow: no `deleteEvent`, no
 * `updateEvent`, no arbitrary-range Sheets write beyond an append. A bounded
 * surface is smaller to review and smaller to misuse from a
 * prompt-injected agent turn. Widening either port later is its own card.
 *
 * The DTOs below are the only shapes allowed to cross the port boundary —
 * adapters translate Google's wire shape (etag, iCalUID, majorDimension, ...)
 * into these and nothing else leaks past that translation. Promoted here
 * (from the backend's `google-tool-ports.ts`) so other packages can depend
 * on the port shape without depending on the backend app.
 */

export const GoogleCalendarEventSchema = z.strictObject({
  id: z.string().min(1),
  summary: z.string(),
  startsAt: z.string(),
  endsAt: z.string()
});

export type GoogleCalendarEvent = z.infer<typeof GoogleCalendarEventSchema>;

export const ListUpcomingGoogleCalendarEventsInputSchema = z.strictObject({
  calendarId: z.string().min(1),
  maxResults: z.number().int().positive()
});

export type ListUpcomingGoogleCalendarEventsInput = z.infer<
  typeof ListUpcomingGoogleCalendarEventsInputSchema
>;

export const CreateGoogleCalendarEventInputSchema = z.strictObject({
  calendarId: z.string().min(1),
  summary: z.string().min(1),
  startsAt: z.string(),
  endsAt: z.string()
});

export type CreateGoogleCalendarEventInput = z.infer<
  typeof CreateGoogleCalendarEventInputSchema
>;

export const CreateGoogleCalendarEventResultSchema = z.strictObject({
  eventId: z.string().min(1)
});

export type CreateGoogleCalendarEventResult = z.infer<
  typeof CreateGoogleCalendarEventResultSchema
>;

export interface GoogleCalendarToolPort {
  listUpcomingEvents(
    input: ListUpcomingGoogleCalendarEventsInput
  ): Promise<readonly GoogleCalendarEvent[]>;
  createEvent(
    input: CreateGoogleCalendarEventInput
  ): Promise<CreateGoogleCalendarEventResult>;
}

export const ReadGoogleSheetRangeInputSchema = z.strictObject({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1)
});

export type ReadGoogleSheetRangeInput = z.infer<typeof ReadGoogleSheetRangeInputSchema>;

export const GoogleSheetRangeValuesSchema = z.array(z.array(z.string()));

export type GoogleSheetRangeValues = z.infer<typeof GoogleSheetRangeValuesSchema>;

export const AppendGoogleSheetRowInputSchema = z.strictObject({
  spreadsheetId: z.string().min(1),
  range: z.string().min(1),
  values: z.array(z.string()).min(1)
});

export type AppendGoogleSheetRowInput = z.infer<typeof AppendGoogleSheetRowInputSchema>;

export interface GoogleSheetsToolPort {
  readRange(
    input: ReadGoogleSheetRangeInput
  ): Promise<readonly (readonly string[])[]>;
  appendRow(input: AppendGoogleSheetRowInput): Promise<void>;
}
