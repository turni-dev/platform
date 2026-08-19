import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTenant, type TenantDatabase } from '../database/with-tenant.js';
import type {
  IdempotencyKeyFound,
  IdempotencyKeyRepositoryPort,
  StoreIdempotencyKeyInput
} from './idempotency-key-repository.port.js';

const uuidV7 = z.uuidv7();

const FindInputSchema = z.strictObject({
  tenantId: uuidV7,
  key: z.string().min(1).max(200)
});

const StoreInputSchema = z.strictObject({
  tenantId: uuidV7,
  key: z.string().min(1).max(200),
  requestHash: z.string().min(1),
  statusCode: z.number().int().positive(),
  response: z.unknown(),
  ttlSeconds: z.number().int().positive()
});

const FoundRowsSchema = z.array(
  z.strictObject({
    request_hash: z.string(),
    status_code: z.number().int(),
    response: z.unknown()
  })
);

/**
 * Backs `idempotency_keys` exactly as it exists today: no schema change, one
 * row per key, globally unique. A race on `store` is handled at the SQL
 * layer with `ON CONFLICT (key) DO NOTHING`, the same discipline
 * `PostgresWebhookInbox` and `PostgresAgentFileStore` use for their own
 * insert races — the loser never sees an error, it reads the winner's row
 * back through `find`.
 */
export class PostgresIdempotencyKeyRepository implements IdempotencyKeyRepositoryPort {
  public constructor(private readonly database: TenantDatabase) {}

  public async find(
    input: Readonly<{ tenantId: string; key: string }>
  ): Promise<IdempotencyKeyFound | undefined> {
    const lookup = FindInputSchema.parse(input);

    return withTenant(this.database, lookup.tenantId, async (transaction) => {
      const rows = FoundRowsSchema.parse(
        await transaction.execute(sql`
          SELECT request_hash, status_code, response
          FROM idempotency_keys
          WHERE tenant_id = ${lookup.tenantId}
            AND key = ${lookup.key}
            AND expires_at > now()
          LIMIT 1
        `)
      );
      const row = rows[0];

      return row === undefined
        ? undefined
        : {
            requestHash: row.request_hash,
            statusCode: row.status_code,
            response: row.response
          };
    });
  }

  public async store(input: StoreIdempotencyKeyInput): Promise<void> {
    const record = StoreInputSchema.parse(input);

    await withTenant(this.database, record.tenantId, (transaction) =>
      transaction
        .execute(
          sql`
            INSERT INTO idempotency_keys (
              key, tenant_id, request_hash, response, status_code, expires_at
            ) VALUES (
              ${record.key}, ${record.tenantId}, ${record.requestHash},
              ${JSON.stringify(record.response ?? null)}::jsonb, ${record.statusCode},
              now() + make_interval(secs => ${record.ttlSeconds})
            )
            ON CONFLICT (key) DO NOTHING
          `
        )
        .then(() => undefined)
    );
  }
}
