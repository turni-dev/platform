/**
 * The DTOs and port interfaces for the two Google tools live in
 * `@turni/contracts` (`ports/google-integration.ts`) so other packages can
 * depend on the port shape without depending on this backend app. This
 * file re-exports them under their original local names so the adapters,
 * Fakes, and tests in this module keep consuming the port the same way —
 * only the import path they resolve through moved.
 */
export {
  GoogleCalendarEventSchema as CalendarEventSchema,
  type GoogleCalendarEvent as CalendarEvent,
  ListUpcomingGoogleCalendarEventsInputSchema as ListUpcomingEventsInputSchema,
  type ListUpcomingGoogleCalendarEventsInput as ListUpcomingEventsInput,
  CreateGoogleCalendarEventInputSchema as CreateCalendarEventInputSchema,
  type CreateGoogleCalendarEventInput as CreateCalendarEventInput,
  CreateGoogleCalendarEventResultSchema as CreateCalendarEventResultSchema,
  type CreateGoogleCalendarEventResult as CreateCalendarEventResult,
  type GoogleCalendarToolPort,
  ReadGoogleSheetRangeInputSchema as ReadSheetRangeInputSchema,
  type ReadGoogleSheetRangeInput as ReadSheetRangeInput,
  GoogleSheetRangeValuesSchema as SheetRangeValuesSchema,
  type GoogleSheetRangeValues as SheetRangeValues,
  AppendGoogleSheetRowInputSchema as AppendSheetRowInputSchema,
  type AppendGoogleSheetRowInput as AppendSheetRowInput,
  type GoogleSheetsToolPort
} from '@turni/contracts';
