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
} from '../google-tool-ports.js';

/** In-memory `GoogleCalendarToolPort` for `modules/agent-core`'s tool
 * registration tests: no network, deterministic incrementing event ids so
 * an assertion on `{ eventId: 'evt-1' }` stays stable across runs. */
export class FakeGoogleCalendarTool implements GoogleCalendarToolPort {
  private readonly events: CalendarEvent[] = [];
  private readonly listCalls: ListUpcomingEventsInput[] = [];
  private readonly createCalls: CreateCalendarEventInput[] = [];
  private eventSequence = 0;

  public get listUpcomingEventsCalls(): readonly ListUpcomingEventsInput[] {
    return this.listCalls;
  }

  public get createEventCalls(): readonly CreateCalendarEventInput[] {
    return this.createCalls;
  }

  /** Seeds events the fake will return from `listUpcomingEvents`; does not
   * go through `createEvent`'s id assignment. */
  public seedEvent(event: CalendarEvent): void {
    this.events.push(CalendarEventSchema.parse(event));
  }

  public listUpcomingEvents(input: ListUpcomingEventsInput): Promise<readonly CalendarEvent[]> {
    const parsed = ListUpcomingEventsInputSchema.parse(input);
    this.listCalls.push(parsed);

    return Promise.resolve(this.events.slice(0, parsed.maxResults));
  }

  public createEvent(input: CreateCalendarEventInput): Promise<CreateCalendarEventResult> {
    const parsed = CreateCalendarEventInputSchema.parse(input);
    this.createCalls.push(parsed);

    this.eventSequence += 1;
    const eventId = `evt-${this.eventSequence}`;
    this.events.push(
      CalendarEventSchema.parse({
        id: eventId,
        summary: parsed.summary,
        startsAt: parsed.startsAt,
        endsAt: parsed.endsAt
      })
    );

    return Promise.resolve(CreateCalendarEventResultSchema.parse({ eventId }));
  }
}
