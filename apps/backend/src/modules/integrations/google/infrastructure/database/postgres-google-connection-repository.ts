import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  withTenant,
  type TenantDatabase,
  type TenantTransaction
} from '../../../../../platform/database/with-tenant.js';
import {
  GoogleConnectionRecordSchema,
  GoogleConnectionStatusSchema,
  type GoogleConnectionRecord,
  type GoogleConnectionRepositoryPort,
  type GoogleConnectionSummary
} from '../../application/google-connection-repository.port.js';

const uuidV7 = z.uuidv7();

const ActivateSchema = z.strictObject({
  tenantId: uuidV7,
  connectionId: uuidV7,
  resources: z.strictObject({
    calendarId: z.string().min(1),
    spreadsheetId: z.string().min(1)
  })
});

const RefreshTokenUpdateSchema = z.strictObject({
  tenantId: uuidV7,
  connectionId: uuidV7,
  refreshTokenEncrypted: z.string().min(1)
});

const SummaryRowSchema = z.strictObject({
  id: uuidV7,
  status: GoogleConnectionStatusSchema,
  google_account_email: z.string().nullable(),
  resources: z.record(z.string(), z.unknown())
});

const UpdatedRowsSchema = z.array(z.strictObject({ id: uuidV7 }));

/** `google_account_email` is nullable at the schema level only for a row the
 * service never actually produces: `completeConsent` always resolves the
 * email before the `INSERT`. A row somehow missing it is not a usable
 * connection to report back to the cabinet. */
function toSummary(row: z.output<typeof SummaryRowSchema>): GoogleConnectionSummary | undefined {
  if (row.google_account_email === null) {
    return undefined;
  }

  const calendarId = row.resources['calendarId'];
  const spreadsheetId = row.resources['spreadsheetId'];

  return {
    id: row.id,
    status: row.status,
    googleAccountEmail: row.google_account_email,
    ...(typeof calendarId === 'string' && calendarId.length > 0 ? { calendarId } : {}),
    ...(typeof spreadsheetId === 'string' && spreadsheetId.length > 0
      ? { spreadsheetId }
      : {})
  };
}

export class PostgresGoogleConnectionRepository implements GoogleConnectionRepositoryPort {
  public constructor(private readonly database: TenantDatabase) {}

  public async create(record: GoogleConnectionRecord): Promise<void> {
    const connection = GoogleConnectionRecordSchema.parse(record);

    await withTenant(this.database, connection.tenantId, (transaction) =>
      transaction
        .execute(
          sql`
            INSERT INTO integration_connections (
              id, tenant_id, agent_id, provider_slug, status, granted_scopes,
              credentials_enc, provider_account_email, resources
            ) VALUES (
              ${connection.id}, ${connection.tenantId}, ${connection.agentId},
              'google', ${connection.status}, ${connection.scopes},
              ${connection.refreshTokenEncrypted}, ${connection.googleAccountEmail},
              ${JSON.stringify(connection.resources)}::jsonb
            )
          `
        )
        .then(() => undefined)
    );
  }

  public async findByTenant(tenantId: string): Promise<GoogleConnectionSummary | undefined> {
    const tenant = uuidV7.parse(tenantId);

    return withTenant(this.database, tenant, async (transaction) => {
      const rows = z.array(SummaryRowSchema).parse(
        await transaction.execute(sql`
          SELECT id, status, provider_account_email AS google_account_email, resources
          FROM integration_connections
          WHERE tenant_id = ${tenant} AND provider_slug = 'google' AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 1
        `)
      );
      const row = rows[0];

      return row === undefined ? undefined : toSummary(row);
    });
  }

  public async activate(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      resources: { calendarId: string; spreadsheetId: string };
    }>
  ): Promise<boolean> {
    const request = ActivateSchema.parse(input);

    return withTenant(this.database, request.tenantId, async (transaction) =>
      wasUpdated(
        transaction,
        sql`
          UPDATE integration_connections
          SET status = 'active',
              resources = ${JSON.stringify(request.resources)}::jsonb
          WHERE tenant_id = ${request.tenantId}
            AND id = ${request.connectionId}
            AND status = 'pending'
          RETURNING id
        `
      )
    );
  }

  public async updateRefreshToken(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      refreshTokenEncrypted: string;
    }>
  ): Promise<void> {
    const request = RefreshTokenUpdateSchema.parse(input);

    await withTenant(this.database, request.tenantId, (transaction) =>
      transaction
        .execute(
          sql`
          UPDATE integration_connections
          SET credentials_enc = ${request.refreshTokenEncrypted}
          WHERE tenant_id = ${request.tenantId}
            AND provider_slug = 'google'
            AND id = ${request.connectionId}
          `
        )
        .then(() => undefined)
    );
  }
}

async function wasUpdated(
  transaction: TenantTransaction,
  query: ReturnType<typeof sql>
): Promise<boolean> {
  return UpdatedRowsSchema.parse(await transaction.execute(query)).length === 1;
}
