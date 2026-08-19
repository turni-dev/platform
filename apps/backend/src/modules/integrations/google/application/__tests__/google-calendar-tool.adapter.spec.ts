import { describe, expect, it } from 'vitest';
import { GoogleCalendarToolAdapter } from '../google-calendar-tool.adapter.js';
import { GoogleCalendarClient } from '../../../../../platform/integrations/google/google-calendar-client.js';

function transport(body: unknown, status = 200): typeof fetch {
  return (): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      }));
}

describe('GoogleCalendarToolAdapter', () => {
  it('lists upcoming events through the typed client using the current access token', async () => {
    const fetchMock = transport({
      items: [
        {
          id: 'evt-1',
          summary: 'Показ квартиры',
          start: { dateTime: '2026-08-20T10:00:00Z' },
          end: { dateTime: '2026-08-20T10:30:00Z' },
          etag: '"some-etag"',
          iCalUID: 'evt-1@google.com'
        }
      ]
    });
    const client = new GoogleCalendarClient({ accessToken: 'a-token', fetch: fetchMock });
    const adapter = new GoogleCalendarToolAdapter(client);

    const events = await adapter.listUpcomingEvents({ calendarId: 'primary', maxResults: 5 });

    expect(events).toEqual([
      {
        id: 'evt-1',
        summary: 'Показ квартиры',
        startsAt: '2026-08-20T10:00:00Z',
        endsAt: '2026-08-20T10:30:00Z'
      }
    ]);
    expect(Object.keys(events[0] ?? {})).not.toContain('etag');
    expect(Object.keys(events[0] ?? {})).not.toContain('iCalUID');
  });

  it('respects maxResults by truncating the events returned', async () => {
    const fetchMock = transport({
      items: [
        { id: 'evt-1', start: { dateTime: '2026-08-20T10:00:00Z' }, end: { dateTime: '2026-08-20T10:30:00Z' } },
        { id: 'evt-2', start: { dateTime: '2026-08-21T10:00:00Z' }, end: { dateTime: '2026-08-21T10:30:00Z' } }
      ]
    });
    const client = new GoogleCalendarClient({ accessToken: 'a-token', fetch: fetchMock });
    const adapter = new GoogleCalendarToolAdapter(client);

    const events = await adapter.listUpcomingEvents({ calendarId: 'primary', maxResults: 1 });

    expect(events).toHaveLength(1);
    expect(events[0]?.id).toBe('evt-1');
  });

  it('creates an event and returns only its id, never echoing full Google payload shape', async () => {
    const fetchMock = transport({
      id: 'evt-3',
      summary: 'Kickoff',
      start: { dateTime: '2026-08-20T10:00:00Z' },
      end: { dateTime: '2026-08-20T11:00:00Z' },
      etag: '"etag-value"',
      htmlLink: 'https://calendar.google.com/event?eid=abc'
    });
    const client = new GoogleCalendarClient({ accessToken: 'a-token', fetch: fetchMock });
    const adapter = new GoogleCalendarToolAdapter(client);

    const result = await adapter.createEvent({
      calendarId: 'primary',
      summary: 'Kickoff',
      startsAt: '2026-08-20T10:00:00Z',
      endsAt: '2026-08-20T11:00:00Z'
    });

    expect(result).toEqual({ eventId: 'evt-3' });
    expect(Object.keys(result)).toEqual(['eventId']);
  });
});
