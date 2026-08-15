import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  withTenant,
  type TenantDatabase,
  type TenantTransaction
} from '../../../../platform/database/with-tenant.js';
import {
  ChannelConnectionRecordSchema,
  ChannelStatusSchema,
  ChannelTypeSchema,
  type ChannelConnectionRecord,
  type ChannelConnectionRepositoryPort,
  type ChannelConnectionSummary
} from '../../application/channel-connection-repository.port.js';

const uuidV7 = z.uuidv7();

const LookupSchema = z.strictObject({ tenantId: uuidV7, connectionId: uuidV7 });
const MetadataUpdateSchema = LookupSchema.extend({
  metadata: z.record(z.string(), z.unknown())
});

const RecordRowSchema = z.strictObject({
  id: uuidV7,
  tenant_id: uuidV7,
  agent_id: uuidV7,
  type: ChannelTypeSchema,
  status: ChannelStatusSchema,
  credentials_enc: z.string().min(1),
  webhook_secret: z.string().min(1),
  meta: z.record(z.string(), z.unknown())
});

const SummaryRowSchema = z.strictObject({
  id: uuidV7,
  type: ChannelTypeSchema,
  status: ChannelStatusSchema,
  meta: z.record(z.string(), z.unknown())
});

const UpdatedRowsSchema = z.array(z.strictObject({ id: uuidV7 }));

function toSummary(row: z.output<typeof SummaryRowSchema>): ChannelConnectionSummary {
  const name = row.meta['community_name'];

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    communityName: typeof name === 'string' && name.length > 0 ? name : 'Без названия'
  };
}

export class PostgresChannelConnectionRepository
  implements ChannelConnectionRepositoryPort
{
  public constructor(private readonly database: TenantDatabase) {}

  public async create(record: ChannelConnectionRecord): Promise<void> {
    const connection = ChannelConnectionRecordSchema.parse(record);

    await withTenant(this.database, connection.tenantId, (transaction) =>
      transaction
        .execute(
          sql`
            INSERT INTO channel_connections (
              id, tenant_id, agent_id, type, credentials_enc, webhook_secret, status, meta
            ) VALUES (
              ${connection.id}, ${connection.tenantId}, ${connection.agentId},
              ${connection.type}, ${connection.credentialsEncrypted},
              ${connection.webhookSecret}, ${connection.status},
              ${JSON.stringify(connection.metadata)}::jsonb
            )
          `
        )
        .then(() => undefined)
    );
  }

  public async findById(
    input: Readonly<{ tenantId: string; connectionId: string }>
  ): Promise<ChannelConnectionRecord | undefined> {
    const lookup = LookupSchema.parse(input);

    return withTenant(this.database, lookup.tenantId, async (transaction) => {
      const rows = z.array(RecordRowSchema).parse(
        await transaction.execute(sql`
          SELECT id, tenant_id, agent_id, type, status, credentials_enc, webhook_secret, meta
          FROM channel_connections
          WHERE tenant_id = ${lookup.tenantId}
            AND id = ${lookup.connectionId}
            AND deleted_at IS NULL
          LIMIT 1
        `)
      );
      const row = rows[0];

      return row === undefined
        ? undefined
        : ChannelConnectionRecordSchema.parse({
            id: row.id,
            tenantId: row.tenant_id,
            agentId: row.agent_id,
            type: row.type,
            status: row.status,
            credentialsEncrypted: row.credentials_enc,
            webhookSecret: row.webhook_secret,
            metadata: row.meta
          });
    });
  }

  public async listByTenant(
    tenantId: string
  ): Promise<readonly ChannelConnectionSummary[]> {
    const tenant = uuidV7.parse(tenantId);

    return withTenant(this.database, tenant, async (transaction) =>
      z
        .array(SummaryRowSchema)
        .parse(
          await transaction.execute(sql`
            SELECT id, type, status, meta
            FROM channel_connections
            WHERE tenant_id = ${tenant} AND deleted_at IS NULL
            ORDER BY created_at
          `)
        )
        .map(toSummary)
    );
  }

  public async saveMetadata(
    input: Readonly<{
      tenantId: string;
      connectionId: string;
      metadata: Record<string, unknown>;
    }>
  ): Promise<void> {
    const update = MetadataUpdateSchema.parse(input);

    await withTenant(this.database, update.tenantId, (transaction) =>
      transaction
        .execute(
          sql`
            UPDATE channel_connections
            SET meta = ${JSON.stringify(update.metadata)}::jsonb
            WHERE tenant_id = ${update.tenantId} AND id = ${update.connectionId}
          `
        )
        .then(() => undefined)
    );
  }

  public async activate(
    input: Readonly<{ tenantId: string; connectionId: string }>
  ): Promise<boolean> {
    const lookup = LookupSchema.parse(input);

    return withTenant(this.database, lookup.tenantId, async (transaction) =>
      wasUpdated(
        transaction,
        sql`
          UPDATE channel_connections
          SET status = 'active'
          WHERE tenant_id = ${lookup.tenantId}
            AND id = ${lookup.connectionId}
            AND status = 'pending'
          RETURNING id
        `
      )
    );
  }
}

async function wasUpdated(
  transaction: TenantTransaction,
  query: ReturnType<typeof sql>
): Promise<boolean> {
  return UpdatedRowsSchema.parse(await transaction.execute(query)).length === 1;
}
