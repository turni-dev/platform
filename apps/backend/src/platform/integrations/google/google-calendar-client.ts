import { z } from 'zod';
import { GoogleApiError, type FetchLike } from './google-oauth-client.js';

const calendarBase = 'https://www.googleapis.com/calendar/v3/calendars';

const GoogleEventTimeSchema = z.object({
  dateTime: z.string().optional(),
  date: z.string().optional(),
  timeZone: z.string().optional()
});

const GoogleEventSchema = z.object({
  id: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  start: GoogleEventTimeSchema.optional(),
  end: GoogleEventTimeSchema.optional(),
  htmlLink: z.string().optional()
});

const GoogleEventListSchema = z.object({
  items: z.array(GoogleEventSchema)
});

const GoogleErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.number().int(),
    status: z.string().optional(),
    message: z.string().optional()
  })
});

export type GoogleEvent = z.infer<typeof GoogleEventSchema>;
export type GoogleEventTime = z.infer<typeof GoogleEventTimeSchema>;

export class GoogleCalendarClient {
  private readonly accessToken: string;
  private readonly fetch: FetchLike;

  public constructor(input: Readonly<{ accessToken: string; fetch?: FetchLike }>) {
    if (input.accessToken.trim().length === 0) {
      throw new Error('A Google access token is required');
    }

    this.accessToken = input.accessToken;
    this.fetch = input.fetch ?? fetch;
  }

  /** The token travels only in the Authorization header, never the URL. */
  public async listEvents(
    input: Readonly<{ calendarId: string }>
  ): Promise<{ items: readonly GoogleEvent[] }> {
    const url = `${calendarBase}/${encodeURIComponent(input.calendarId)}/events`;

    const response = await this.fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const json: unknown = await response.json();

    return GoogleEventListSchema.parse(json);
  }

  public async createEvent(
    input: Readonly<{
      calendarId: string;
      event: Readonly<{
        summary?: string;
        description?: string;
        start: GoogleEventTime;
        end: GoogleEventTime;
      }>;
    }>
  ): Promise<GoogleEvent> {
    const url = `${calendarBase}/${encodeURIComponent(input.calendarId)}/events`;

    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(input.event)
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const json: unknown = await response.json();

    return GoogleEventSchema.parse(json);
  }

  /** A non-2xx body might not be JSON at all (an empty body, an HTML error
   * page from a load balancer or WAF) — never let that surface as a raw
   * SyntaxError or ZodError instead of a typed GoogleApiError. */
  private async toApiError(response: Response): Promise<GoogleApiError> {
    try {
      const json: unknown = await response.json();
      const parsed = GoogleErrorEnvelopeSchema.safeParse(json);
      const code = parsed.success
        ? (parsed.data.error.status ?? String(parsed.data.error.code))
        : 'unknown_error';

      return new GoogleApiError(response.status, code);
    } catch {
      return new GoogleApiError(response.status, 'unknown_error');
    }
  }

  /** Access token material must survive neither a log line nor a serialized
   * object. */
  public toJSON(): string {
    return '[GoogleCalendarClient]';
  }
}
