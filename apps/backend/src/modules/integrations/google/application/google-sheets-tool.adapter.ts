import type { GoogleSheetsClient } from '../../../../platform/integrations/google/index.js';
import {
  AppendSheetRowInputSchema,
  ReadSheetRangeInputSchema,
  SheetRangeValuesSchema,
  type AppendSheetRowInput,
  type GoogleSheetsToolPort,
  type ReadSheetRangeInput
} from './google-tool-ports.js';

/** Wraps the platform `GoogleSheetsClient` behind the bounded
 * `GoogleSheetsToolPort`: reads return plain string rows only — no cell
 * formatting, no formula definitions — and appends validate a non-empty row
 * of plain strings before anything reaches Google. */
export class GoogleSheetsToolAdapter implements GoogleSheetsToolPort {
  public constructor(private readonly client: GoogleSheetsClient) {}

  public async readRange(input: ReadSheetRangeInput): Promise<readonly (readonly string[])[]> {
    const parsed = ReadSheetRangeInputSchema.parse(input);
    const { values } = await this.client.readRange({
      spreadsheetId: parsed.spreadsheetId,
      range: parsed.range
    });

    return SheetRangeValuesSchema.parse(values);
  }

  public async appendRow(input: AppendSheetRowInput): Promise<void> {
    const parsed = AppendSheetRowInputSchema.parse(input);

    await this.client.appendRow({
      spreadsheetId: parsed.spreadsheetId,
      range: parsed.range,
      values: parsed.values
    });
  }
}
