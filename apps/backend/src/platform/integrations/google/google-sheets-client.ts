import { z } from 'zod';
import { GoogleApiError, type FetchLike } from './google-oauth-client.js';

const sheetsBase = 'https://sheets.googleapis.com/v4/spreadsheets';

/** A1 ranges use ':' to separate cells (e.g. `Sheet1!A1:B2`); encode
 * everything else but keep that colon literal so the URL stays readable and
 * matches what Google's own client emits. */
function encodeRange(range: string): string {
  return encodeURIComponent(range).replace(/%3A/g, ':');
}

const GoogleValueRangeSchema = z.object({
  range: z.string().optional(),
  majorDimension: z.string().optional(),
  values: z.array(z.array(z.string())).optional()
});

const GoogleAppendResponseSchema = z.object({
  spreadsheetId: z.string(),
  updates: z.object({
    updatedRange: z.string()
  })
});

const GoogleErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.number().int(),
    status: z.string().optional(),
    message: z.string().optional()
  })
});

export class GoogleSheetsClient {
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
  public async readRange(
    input: Readonly<{ spreadsheetId: string; range: string }>
  ): Promise<{ values: readonly (readonly string[])[] }> {
    const url = `${sheetsBase}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeRange(input.range)}`;

    const response = await this.fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const json: unknown = await response.json();

    const parsed = GoogleValueRangeSchema.parse(json);

    return { values: parsed.values ?? [] };
  }

  public async appendRow(
    input: Readonly<{ spreadsheetId: string; range: string; values: readonly string[] }>
  ): Promise<{ updatedRange: string }> {
    const url = `${sheetsBase}/${encodeURIComponent(input.spreadsheetId)}/values/${encodeRange(input.range)}:append?valueInputOption=RAW`;

    const response = await this.fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ values: [input.values] })
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    const json: unknown = await response.json();

    const parsed = GoogleAppendResponseSchema.parse(json);

    return { updatedRange: parsed.updates.updatedRange };
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
    return '[GoogleSheetsClient]';
  }
}
