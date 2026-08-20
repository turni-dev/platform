import type { McpCapability, McpInvocation, McpInvocationResult } from '@turni/contracts';
import {
  AppendSheetRowInputSchema,
  CreateCalendarEventInputSchema,
  ListUpcomingEventsInputSchema,
  ReadSheetRangeInputSchema,
  type GoogleCalendarToolPort,
  type GoogleSheetsToolPort
} from './google-tool-ports.js';
import type { McpProvider } from '../../mcp/application/first-party-mcp-registry.js';

const capabilities = [
  { id: 'google.calendar.events.list', providerSlug: 'google', operation: 'read' },
  { id: 'google.calendar.events.create', providerSlug: 'google', operation: 'write' },
  { id: 'google.sheets.range.read', providerSlug: 'google', operation: 'read' },
  { id: 'google.sheets.rows.append', providerSlug: 'google', operation: 'write' }
] as const satisfies readonly McpCapability[];

/** First-party Google provider. It knows only our narrow Calendar/Sheets
 * adapters; all Google API wire types remain below those adapters. */
export class GoogleMcpProvider implements McpProvider {
  public readonly providerSlug = 'google' as const;
  public readonly capabilities = capabilities;

  public constructor(
    private readonly calendar: GoogleCalendarToolPort,
    private readonly sheets: GoogleSheetsToolPort
  ) {}

  public async invoke(input: McpInvocation): Promise<McpInvocationResult> {
    switch (input.capabilityId) {
      case 'google.calendar.events.list': {
        const events = await this.calendar.listUpcomingEvents(
          ListUpcomingEventsInputSchema.parse(input.input)
        );
        return { output: { events: [...events] } };
      }
      case 'google.calendar.events.create': {
        const result = await this.calendar.createEvent(CreateCalendarEventInputSchema.parse(input.input));
        return { output: result };
      }
      case 'google.sheets.range.read': {
        const values = await this.sheets.readRange(ReadSheetRangeInputSchema.parse(input.input));
        return { output: { values: values.map((row) => [...row]) } };
      }
      case 'google.sheets.rows.append':
        await this.sheets.appendRow(AppendSheetRowInputSchema.parse(input.input));
        return { output: {} };
      default:
        throw new Error(`Google does not own MCP capability ${input.capabilityId}`);
    }
  }
}
