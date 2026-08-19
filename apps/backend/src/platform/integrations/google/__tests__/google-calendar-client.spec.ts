import { describe, expect, it, vi } from 'vitest';
import { GoogleCalendarClient } from '../google-calendar-client.js';
import { GoogleApiError } from '../google-oauth-client.js';

type FetchCall = readonly [string, RequestInit];

function transport(
  body: unknown,
  status = 200
): {
  fetch: typeof fetch;
  calls: () => readonly FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchMock = (url: string, init: RequestInit): Promise<Response> => {
    calls.push([url, init]);

    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      })
    );
  };

  return { fetch: fetchMock as unknown as typeof fetch, calls: () => calls };
}

function nonJsonTransport(status: number, body = ''): typeof fetch {
  return vi.fn(
    (): Promise<Response> =>
      Promise.resolve(new Response(body, { status, headers: { 'content-type': 'text/html' } }))
  );
}

describe('GoogleCalendarClient', () => {
  it('lists events with the access token in the Authorization header, never the URL', async () => {
    const stub = transport({ items: [{ id: 'evt-1', summary: 'Standup' }] });
    const client = new GoogleCalendarClient({ accessToken: 'secret-token', fetch: stub.fetch });

    const result = await client.listEvents({ calendarId: 'primary' });

    const [url, init] = stub.calls()[0]!;
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(url).not.toContain('secret-token');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-token');
    expect(result.items[0]?.id).toBe('evt-1');
  });

  it('creates an event by posting to the events collection with the bearer token', async () => {
    const stub = transport({ id: 'evt-2', summary: 'Kickoff' });
    const client = new GoogleCalendarClient({ accessToken: 'secret-token', fetch: stub.fetch });

    const result = await client.createEvent({
      calendarId: 'primary',
      event: { summary: 'Kickoff', start: { dateTime: '2026-08-20T10:00:00Z' }, end: { dateTime: '2026-08-20T11:00:00Z' } }
    });

    const [url, init] = stub.calls()[0]!;
    expect(url).toBe('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-token');
    expect(String(init.body as string | URLSearchParams)).not.toContain('secret-token');
    expect(result.id).toBe('evt-2');
  });

  it('turns a 401 into a typed GoogleApiError so the caller can refresh and retry once', async () => {
    const client = new GoogleCalendarClient({
      accessToken: 'secret-token',
      fetch: transport({ error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } }, 401).fetch
    });

    const failure = await client.listEvents({ calendarId: 'primary' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GoogleApiError);
    expect((failure as GoogleApiError).status).toBe(401);
    expect(JSON.stringify(failure)).not.toContain('secret-token');
  });

  it('turns a non-JSON error body (e.g. a WAF or gateway error page) into a typed GoogleApiError', async () => {
    const client = new GoogleCalendarClient({
      accessToken: 'secret-token',
      fetch: nonJsonTransport(502, '<html>Bad Gateway</html>')
    });

    const failure = await client.listEvents({ calendarId: 'primary' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GoogleApiError);
    expect((failure as GoogleApiError).status).toBe(502);
  });

  it('turns an empty error body into a typed GoogleApiError', async () => {
    const client = new GoogleCalendarClient({
      accessToken: 'secret-token',
      fetch: nonJsonTransport(429)
    });

    const failure = await client.listEvents({ calendarId: 'primary' }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GoogleApiError);
    expect((failure as GoogleApiError).status).toBe(429);
  });

  it('never serializes its access token', () => {
    const client = new GoogleCalendarClient({ accessToken: 'secret-token', fetch: transport({}).fetch });

    expect(JSON.stringify({ client })).not.toContain('secret-token');
  });
});
