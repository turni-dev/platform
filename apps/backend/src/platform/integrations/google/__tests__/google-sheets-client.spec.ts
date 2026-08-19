import { describe, expect, it } from 'vitest';
import { GoogleSheetsClient } from '../google-sheets-client.js';
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

describe('GoogleSheetsClient', () => {
  it('reads a range with the access token in the Authorization header, never the URL', async () => {
    const stub = transport({ range: 'Sheet1!A1:B2', majorDimension: 'ROWS', values: [['a', 'b']] });
    const client = new GoogleSheetsClient({ accessToken: 'secret-token', fetch: stub.fetch });

    const result = await client.readRange({ spreadsheetId: 'sheet-id', range: 'Sheet1!A1:B2' });

    const [url, init] = stub.calls()[0]!;
    expect(url).toBe(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Sheet1!A1:B2'
    );
    expect(url).not.toContain('secret-token');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-token');
    expect(result.values).toEqual([['a', 'b']]);
  });

  it('appends a row by posting :append with the bearer token, never the URL', async () => {
    const stub = transport({ spreadsheetId: 'sheet-id', updates: { updatedRange: 'Sheet1!A3:B3' } });
    const client = new GoogleSheetsClient({ accessToken: 'secret-token', fetch: stub.fetch });

    const result = await client.appendRow({
      spreadsheetId: 'sheet-id',
      range: 'Sheet1!A1:B1',
      values: ['x', 'y']
    });

    const [url, init] = stub.calls()[0]!;
    expect(url).toContain(
      'https://sheets.googleapis.com/v4/spreadsheets/sheet-id/values/Sheet1!A1:B1:append'
    );
    expect(url).not.toContain('secret-token');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer secret-token');
    expect(String(init.body as string | URLSearchParams)).not.toContain('secret-token');
    expect(result.updatedRange).toBe('Sheet1!A3:B3');
  });

  it('turns a 401 into a typed GoogleApiError so the caller can refresh and retry once', async () => {
    const client = new GoogleSheetsClient({
      accessToken: 'secret-token',
      fetch: transport({ error: { code: 401, message: 'Invalid Credentials', status: 'UNAUTHENTICATED' } }, 401).fetch
    });

    const failure = await client
      .readRange({ spreadsheetId: 'sheet-id', range: 'Sheet1!A1:B2' })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(GoogleApiError);
    expect((failure as GoogleApiError).status).toBe(401);
    expect(JSON.stringify(failure)).not.toContain('secret-token');
  });

  it('never serializes its access token', () => {
    const client = new GoogleSheetsClient({ accessToken: 'secret-token', fetch: transport({}).fetch });

    expect(JSON.stringify({ client })).not.toContain('secret-token');
  });
});
