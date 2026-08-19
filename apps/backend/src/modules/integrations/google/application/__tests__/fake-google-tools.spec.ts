import { describe, expect, it } from 'vitest';
import { FakeGoogleCalendarTool } from '../fakes/fake-google-calendar-tool.js';
import { FakeGoogleSheetsTool } from '../fakes/fake-google-sheets-tool.js';
import type { GoogleCalendarToolPort, GoogleSheetsToolPort } from '../google-tool-ports.js';

describe('FakeGoogleCalendarTool', () => {
  it('satisfies GoogleCalendarToolPort without a network', () => {
    const fake: GoogleCalendarToolPort = new FakeGoogleCalendarTool();
    expect(fake).toBeDefined();
  });

  it('assigns deterministic incrementing event ids across calls', async () => {
    const fake = new FakeGoogleCalendarTool();

    const first = await fake.createEvent({
      calendarId: 'primary',
      summary: 'Показ квартиры',
      startsAt: '2026-08-20T10:00:00Z',
      endsAt: '2026-08-20T10:30:00Z'
    });
    const second = await fake.createEvent({
      calendarId: 'primary',
      summary: 'Повторный показ',
      startsAt: '2026-08-21T10:00:00Z',
      endsAt: '2026-08-21T10:30:00Z'
    });

    expect(first).toEqual({ eventId: 'evt-1' });
    expect(second).toEqual({ eventId: 'evt-2' });
    expect(fake.createEventCalls).toHaveLength(2);
  });

  it('lists events created earlier, bounded by maxResults', async () => {
    const fake = new FakeGoogleCalendarTool();
    await fake.createEvent({
      calendarId: 'primary',
      summary: 'A',
      startsAt: '2026-08-20T10:00:00Z',
      endsAt: '2026-08-20T10:30:00Z'
    });
    await fake.createEvent({
      calendarId: 'primary',
      summary: 'B',
      startsAt: '2026-08-21T10:00:00Z',
      endsAt: '2026-08-21T10:30:00Z'
    });

    const events = await fake.listUpcomingEvents({ calendarId: 'primary', maxResults: 1 });

    expect(events).toEqual([
      { id: 'evt-1', summary: 'A', startsAt: '2026-08-20T10:00:00Z', endsAt: '2026-08-20T10:30:00Z' }
    ]);
    expect(fake.listUpcomingEventsCalls).toHaveLength(1);
  });
});

describe('FakeGoogleSheetsTool', () => {
  it('satisfies GoogleSheetsToolPort without a network', () => {
    const fake: GoogleSheetsToolPort = new FakeGoogleSheetsTool();
    expect(fake).toBeDefined();
  });

  it('records appended rows and echoes them back from readRange', async () => {
    const fake = new FakeGoogleSheetsTool();

    await fake.appendRow({
      spreadsheetId: 'sheet-1',
      range: 'Sheet1!A:B',
      values: ['Мария', '+79991112233']
    });
    const rows = await fake.readRange({ spreadsheetId: 'sheet-1', range: 'Sheet1!A:B' });

    expect(rows).toEqual([['Мария', '+79991112233']]);
    expect(fake.appendRowCalls).toHaveLength(1);
    expect(fake.readRangeCalls).toHaveLength(1);
  });

  it('returns an empty range when nothing was seeded or appended', async () => {
    const fake = new FakeGoogleSheetsTool();

    const rows = await fake.readRange({ spreadsheetId: 'unknown-sheet', range: 'Sheet1!A:B' });

    expect(rows).toEqual([]);
  });
});
