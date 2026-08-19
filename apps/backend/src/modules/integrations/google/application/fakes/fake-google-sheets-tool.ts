import {
  AppendSheetRowInputSchema,
  ReadSheetRangeInputSchema,
  type AppendSheetRowInput,
  type GoogleSheetsToolPort,
  type ReadSheetRangeInput
} from '../google-tool-ports.js';

/** In-memory `GoogleSheetsToolPort` for `modules/agent-core`'s tool
 * registration tests: no network, records every call, and keeps appended
 * rows per spreadsheet so `readRange` can echo them back deterministically. */
export class FakeGoogleSheetsTool implements GoogleSheetsToolPort {
  private readonly rowsBySpreadsheet = new Map<string, string[][]>();
  private readonly readCalls: ReadSheetRangeInput[] = [];
  private readonly appendCalls: AppendSheetRowInput[] = [];

  public get readRangeCalls(): readonly ReadSheetRangeInput[] {
    return this.readCalls;
  }

  public get appendRowCalls(): readonly AppendSheetRowInput[] {
    return this.appendCalls;
  }

  /** Seeds the rows a subsequent `readRange` on this spreadsheet returns. */
  public seedRows(spreadsheetId: string, rows: readonly (readonly string[])[]): void {
    this.rowsBySpreadsheet.set(
      spreadsheetId,
      rows.map((row) => [...row])
    );
  }

  public readRange(input: ReadSheetRangeInput): Promise<readonly (readonly string[])[]> {
    const parsed = ReadSheetRangeInputSchema.parse(input);
    this.readCalls.push(parsed);

    return Promise.resolve(this.rowsBySpreadsheet.get(parsed.spreadsheetId) ?? []);
  }

  public appendRow(input: AppendSheetRowInput): Promise<void> {
    const parsed = AppendSheetRowInputSchema.parse(input);
    this.appendCalls.push(parsed);

    const rows = this.rowsBySpreadsheet.get(parsed.spreadsheetId) ?? [];
    rows.push([...parsed.values]);
    this.rowsBySpreadsheet.set(parsed.spreadsheetId, rows);

    return Promise.resolve();
  }
}
