import { describe, expect, it } from 'vitest';
import { GoogleMcpProvider } from '../google-mcp-provider.js';
import { FakeGoogleCalendarTool } from '../fakes/fake-google-calendar-tool.js';
import { FakeGoogleSheetsTool } from '../fakes/fake-google-sheets-tool.js';

const connectionId = '018f2d15-7b34-7a20-8f49-b2f1a430e4d1';

describe('GoogleMcpProvider', () => {
  it('exposes only the four reviewed Google capabilities', () => {
    const provider = new GoogleMcpProvider(new FakeGoogleCalendarTool(), new FakeGoogleSheetsTool());

    expect(provider.capabilities.map((capability) => capability.id)).toEqual([
      'google.calendar.events.list',
      'google.calendar.events.create',
      'google.sheets.range.read',
      'google.sheets.rows.append'
    ]);
  });

  it('routes an event write through the bounded calendar adapter', async () => {
    const calendar = new FakeGoogleCalendarTool();
    const provider = new GoogleMcpProvider(calendar, new FakeGoogleSheetsTool());

    await expect(
      provider.invoke({
        connectionId,
        capabilityId: 'google.calendar.events.create',
        input: {
          calendarId: 'primary', summary: 'Встреча',
          startsAt: '2026-08-20T10:00:00.000Z', endsAt: '2026-08-20T11:00:00.000Z'
        }
      })
    ).resolves.toEqual({ output: { eventId: 'evt-1' } });

    expect(calendar.createEventCalls).toHaveLength(1);
  });

  it('rejects invalid capability input before reaching a provider adapter', async () => {
    const calendar = new FakeGoogleCalendarTool();
    const provider = new GoogleMcpProvider(calendar, new FakeGoogleSheetsTool());

    await expect(
      provider.invoke({ connectionId, capabilityId: 'google.calendar.events.create', input: {} })
    ).rejects.toThrow();
    expect(calendar.createEventCalls).toEqual([]);
  });
});
