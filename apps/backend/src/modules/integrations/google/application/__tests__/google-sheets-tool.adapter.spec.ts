import { describe, expect, it } from 'vitest';
import { GoogleSheetsToolAdapter } from '../google-sheets-tool.adapter.js';
import { GoogleSheetsClient } from '../../../../../platform/integrations/google/google-sheets-client.js';

function transport(body: unknown, status = 200): typeof fetch {
  return (): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' }
      }));
}

describe('GoogleSheetsToolAdapter', () => {
  it('reads a range and returns rows of plain strings only', async () => {
    const fetchMock = transport({
      range: 'Sheet1!A1:B2',
      majorDimension: 'ROWS',
      values: [
        ['Имя', 'Телефон'],
        ['Анна', '+79990000000']
      ]
    });
    const client = new GoogleSheetsClient({ accessToken: 'a-token', fetch: fetchMock });
    const adapter = new GoogleSheetsToolAdapter(client);

    const rows = await adapter.readRange({ spreadsheetId: 'sheet-1', range: 'Sheet1!A1:B2' });

    expect(rows).toEqual([
      ['Имя', 'Телефон'],
      ['Анна', '+79990000000']
    ]);
  });

  it('returns an empty range as an empty array', async () => {
    const fetchMock = transport({ range: 'Sheet1!A1:B2', majorDimension: 'ROWS' });
    const client = new GoogleSheetsClient({ accessToken: 'a-token', fetch: fetchMock });
    const adapter = new GoogleSheetsToolAdapter(client);

    const rows = await adapter.readRange({ spreadsheetId: 'sheet-1', range: 'Sheet1!A1:B2' });

    expect(rows).toEqual([]);
  });

  it('appends a row and resolves void without leaking the updated range', async () => {
    const fetchMock = transport({
      spreadsheetId: 'sheet-1',
      updates: { updatedRange: 'Sheet1!A3:B3' }
    });
    const client = new GoogleSheetsClient({ accessToken: 'a-token', fetch: fetchMock });
    const adapter = new GoogleSheetsToolAdapter(client);

    const result = await adapter.appendRow({
      spreadsheetId: 'sheet-1',
      range: 'Sheet1!A:B',
      values: ['Мария', '+79991112233']
    });

    expect(result).toBeUndefined();
  });

  it('rejects an empty values array before it reaches Google', async () => {
    const client = new GoogleSheetsClient({ accessToken: 'a-token', fetch: transport({}) });
    const adapter = new GoogleSheetsToolAdapter(client);

    await expect(
      adapter.appendRow({ spreadsheetId: 'sheet-1', range: 'Sheet1!A:B', values: [] })
    ).rejects.toThrow();
  });
});
