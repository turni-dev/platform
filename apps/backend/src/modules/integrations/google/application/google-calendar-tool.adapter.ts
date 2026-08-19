import type { GoogleCalendarClient } from '../../../../platform/integrations/google/index.js';
import type { GoogleEvent } from '../../../../platform/integrations/google/google-calendar-client.js';
import {
  CalendarEventSchema,
  CreateCalendarEventInputSchema,
  CreateCalendarEventResultSchema,
  ListUpcomingEventsInputSchema,
  type CalendarEvent,
  type CreateCalendarEventInput,
  type CreateCalendarEventResult,
  type GoogleCalendarToolPort,
  type ListUpcomingEventsInput
} from './google-tool-ports.js';

/** Google's event time can carry either an all-day `date` or a precise
 * `dateTime`; the port only ever exposes a single ISO-ish string, so an
 * all-day event's date stands in for both bounds when no `dateTime` is
 * present. */
function toIsoString(time: GoogleEvent['start']): string {
  return time?.dateTime ?? time?.date ?? '';
}

function toCalendarEvent(event: GoogleEvent): CalendarEvent {
  return CalendarEventSchema.parse({
    id: event.id,
    summary: event.summary ?? '',
    startsAt: toIsoString(event.start),
    endsAt: toIsoString(event.end)
  });
}

/** Wraps the platform `GoogleCalendarClient` behind the bounded
 * `GoogleCalendarToolPort`: only `id`, `summary`, `startsAt`, `endsAt` cross
 * this boundary — never `etag`, `iCalUID`, `htmlLink`, or any other
 * Google-specific field. */
export class GoogleCalendarToolAdapter implements GoogleCalendarToolPort {
  public constructor(private readonly client: GoogleCalendarClient) {}

  public async listUpcomingEvents(input: ListUpcomingEventsInput): Promise<readonly CalendarEvent[]> {
    const parsed = ListUpcomingEventsInputSchema.parse(input);
    const { items } = await this.client.listEvents({ calendarId: parsed.calendarId });

    return items.slice(0, parsed.maxResults).map(toCalendarEvent);
  }

  public async createEvent(input: CreateCalendarEventInput): Promise<CreateCalendarEventResult> {
    const parsed = CreateCalendarEventInputSchema.parse(input);

    const event = await this.client.createEvent({
      calendarId: parsed.calendarId,
      event: {
        summary: parsed.summary,
        start: { dateTime: parsed.startsAt },
        end: { dateTime: parsed.endsAt }
      }
    });

    return CreateCalendarEventResultSchema.parse({ eventId: event.id });
  }
}
