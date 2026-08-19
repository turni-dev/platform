import { z } from 'zod';

export const GoogleConnectionStatusSchema = z.enum([
  'pending',
  'active',
  'error',
  'disabled'
]);

export type GoogleConnectionStatus = z.infer<typeof GoogleConnectionStatusSchema>;

/** What the cabinet is allowed to see: never the refresh token, encrypted or
 * not. */
export const GoogleConnectionSummarySchema = z.strictObject({
  id: z.uuidv7(),
  status: GoogleConnectionStatusSchema,
  googleAccountEmail: z.string().min(1),
  calendarId: z.string().min(1).optional(),
  spreadsheetId: z.string().min(1).optional()
});

export type GoogleConnectionSummary = z.infer<typeof GoogleConnectionSummarySchema>;

/** The row shape the repository writes and reads back. `refreshTokenEncrypted`
 * and `googleAccountEmail` are nullable at the schema level (matching the
 * table) because a `pending` row is created the instant the code exchange
 * succeeds — before, there is nothing to persist yet. */
export const GoogleConnectionRecordSchema = z.strictObject({
  id: z.uuidv7(),
  tenantId: z.uuidv7(),
  agentId: z.uuidv7(),
  status: GoogleConnectionStatusSchema,
  scopes: z.array(z.string().min(1)),
  refreshTokenEncrypted: z.string().min(1).nullable(),
  googleAccountEmail: z.string().min(1).nullable(),
  resources: z.record(z.string(), z.unknown())
});

export type GoogleConnectionRecord = z.infer<typeof GoogleConnectionRecordSchema>;

export interface GoogleConnectionRepositoryPort {
  create(record: GoogleConnectionRecord): Promise<void>;
  /** The one connection a tenant currently has, most recently created first;
   * one Google connection per tenant in MVP, the table already supports
   * more. */
  findByTenant(tenantId: string): Promise<GoogleConnectionSummary | undefined>;
  /** Moves a `pending` connection to `active` with its chosen resources,
   * exactly once; a repeat (or a row that isn't `pending`) returns false. */
  activate(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      resources: { calendarId: string; spreadsheetId: string };
    }>
  ): Promise<boolean>;
  updateRefreshToken(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      refreshTokenEncrypted: string;
    }>
  ): Promise<void>;
}
