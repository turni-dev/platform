import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  withTenant,
  type TenantDatabase,
  type TenantTransaction
} from '../../../../platform/database/with-tenant.js';
import {
  parseOwnerSessionRecord,
  type OwnerSessionRecord,
  type OwnerSessionStorePort
} from '../../application/owner-session-store.port.js';

const tokenHash = z.instanceof(Uint8Array).refine((value) => value.length === 32);

const LookupSchema = z.strictObject({
  tenantId: z.uuidv7(),
  tokenHash,
  now: z.date()
});
const RotationSchema = z.strictObject({
  tenantId: z.uuidv7(),
  currentTokenHash: tokenHash,
  nextTokenHash: tokenHash,
  idleExpiresAt: z.date(),
  now: z.date()
});
const RevocationSchema = z.strictObject({ tenantId: z.uuidv7(), tokenHash });

const SessionRowSchema = z.strictObject({
  id: z.uuidv7(),
  tenant_id: z.uuidv7(),
  user_id: z.uuidv7(),
  token_hash: tokenHash,
  idle_expires_at: z.date(),
  absolute_expires_at: z.date(),
  ip: z.string().nullable(),
  ua: z.string().nullable()
});
const RevokedRowsSchema = z.array(z.strictObject({ id: z.uuidv7() }));

function parseRows(result: unknown): readonly OwnerSessionRecord[] {
  return z
    .array(SessionRowSchema)
    .parse(result)
    .map((row) =>
      parseOwnerSessionRecord({
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        tokenHash: row.token_hash,
        idleExpiresAt: row.idle_expires_at,
        absoluteExpiresAt: row.absolute_expires_at,
        ...(row.ip === null ? {} : { ipAddress: row.ip }),
        ...(row.ua === null ? {} : { userAgent: row.ua })
      })
    );
}

export class PostgresOwnerSessionStore implements OwnerSessionStorePort {
  public constructor(private readonly database: TenantDatabase) {}

  public async insert(input: OwnerSessionRecord): Promise<void> {
    const session = parseOwnerSessionRecord(input);

    await withTenant(this.database, session.tenantId, (transaction) =>
      transaction
        .execute(sql`
          INSERT INTO sessions (
            id, tenant_id, user_id, token_hash, ip, ua,
            idle_expires_at, absolute_expires_at
          ) VALUES (
            ${session.id}, ${session.tenantId}, ${session.userId}, ${session.tokenHash},
            ${session.ipAddress ?? null}, ${session.userAgent ?? null},
            ${session.idleExpiresAt}, ${session.absoluteExpiresAt}
          )
        `)
        .then(() => undefined)
    );
  }

  public async findActive(
    input: Readonly<{ tenantId: string; tokenHash: Uint8Array; now: Date }>
  ): Promise<OwnerSessionRecord | undefined> {
    const lookup = LookupSchema.parse(input);

    return this.inTenant(lookup.tenantId, async (transaction) => {
      const rows = parseRows(
        await transaction.execute(sql`
          SELECT id, tenant_id, user_id, token_hash, idle_expires_at,
            absolute_expires_at, ip, ua
          FROM sessions
          WHERE tenant_id = ${lookup.tenantId}
            AND token_hash = ${lookup.tokenHash}
            AND idle_expires_at > ${lookup.now}
            AND absolute_expires_at > ${lookup.now}
          LIMIT 1
        `)
      );

      return rows[0];
    });
  }

  public async rotate(
    input: Readonly<{
      tenantId: string;
      currentTokenHash: Uint8Array;
      nextTokenHash: Uint8Array;
      idleExpiresAt: Date;
      now: Date;
    }>
  ): Promise<OwnerSessionRecord | undefined> {
    const rotation = RotationSchema.parse(input);

    return this.inTenant(rotation.tenantId, async (transaction) => {
      const rows = parseRows(
        await transaction.execute(sql`
          UPDATE sessions
          SET token_hash = ${rotation.nextTokenHash},
            idle_expires_at = ${rotation.idleExpiresAt}
          WHERE tenant_id = ${rotation.tenantId}
            AND token_hash = ${rotation.currentTokenHash}
            AND idle_expires_at > ${rotation.now}
            AND absolute_expires_at > ${rotation.now}
          RETURNING id, tenant_id, user_id, token_hash, idle_expires_at,
            absolute_expires_at, ip, ua
        `)
      );

      return rows[0];
    });
  }

  public async revoke(
    input: Readonly<{ tenantId: string; tokenHash: Uint8Array }>
  ): Promise<boolean> {
    const revocation = RevocationSchema.parse(input);

    return this.inTenant(
      revocation.tenantId,
      async (transaction) =>
        RevokedRowsSchema.parse(
          await transaction.execute(sql`
            DELETE FROM sessions
            WHERE tenant_id = ${revocation.tenantId}
              AND token_hash = ${revocation.tokenHash}
            RETURNING id
          `)
        ).length === 1
    );
  }

  private inTenant<T>(
    tenantId: string,
    operation: (transaction: TenantTransaction) => Promise<T>
  ): Promise<T> {
    return withTenant(this.database, tenantId, operation);
  }
}
