import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  withTenant,
  type TenantDatabase,
  type TenantTransaction
} from '../../../../platform/database/with-tenant.js';
import {
  parseGuestSessionStoreRecord,
  type GuestSessionStorePort,
  type GuestSessionStoreRecord
} from '../../application/guest-session-store.port.js';

const uuidV7 = z.uuidv7();
const tokenHash = z.instanceof(Uint8Array).refine((value) => value.length === 32);

const GuestSessionLookupSchema = z.strictObject({ tenantId: uuidV7, tokenHash });

const GuestSessionRevocationSchema = GuestSessionLookupSchema.extend({
  revokedAt: z.date()
});

const GuestSessionLastUseSchema = GuestSessionLookupSchema.extend({
  lastUsedAt: z.date()
});

const GuestSessionDatabaseRowSchema = z.strictObject({
  id: uuidV7,
  tenant_id: uuidV7,
  agent_id: uuidV7,
  connection_id: uuidV7,
  guest_id: uuidV7.nullable(),
  token_hash: tokenHash,
  token_kid: z.string().trim().min(1).max(128),
  issued_at: z.date(),
  expires_at: z.date(),
  revoked_at: z.date().nullable(),
  last_used_at: z.date().nullable(),
  created_at: z.date()
});

const UpdatedRowsSchema = z.array(z.strictObject({ id: uuidV7 }));

function parseRows(result: unknown): readonly GuestSessionStoreRecord[] {
  return z.array(GuestSessionDatabaseRowSchema).parse(result).map((row) => ({
    id: row.id,
    tenantId: row.tenant_id,
    agentId: row.agent_id,
    connectionId: row.connection_id,
    guestId: row.guest_id ?? undefined,
    tokenHash: row.token_hash,
    tokenKid: row.token_kid,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined
  })).map(parseGuestSessionStoreRecord);
}

async function wasUpdated(transaction: TenantTransaction, query: ReturnType<typeof sql>): Promise<boolean> {
  return UpdatedRowsSchema.parse(await transaction.execute(query)).length === 1;
}

export class PostgresGuestSessionStore implements GuestSessionStorePort {
  public constructor(private readonly database: TenantDatabase) {}

  public async insert(input: GuestSessionStoreRecord): Promise<void> {
    const session = parseGuestSessionStoreRecord(input);

    await withTenant(this.database, session.tenantId, (transaction) =>
      transaction.execute(sql`
        INSERT INTO guest_sessions (
          id, tenant_id, agent_id, connection_id, guest_id, token_hash, token_kid,
          issued_at, expires_at
        ) VALUES (
          ${session.id}, ${session.tenantId}, ${session.agentId}, ${session.connectionId},
          ${session.guestId ?? null}, ${session.tokenHash}, ${session.tokenKid},
          ${session.issuedAt}, ${session.expiresAt}
        )
      `).then(() => undefined)
    );
  }

  public async findByTokenHash(
    input: Readonly<{ tenantId: string; tokenHash: Uint8Array }>
  ): Promise<GuestSessionStoreRecord | undefined> {
    const lookup = GuestSessionLookupSchema.parse(input);

    return withTenant(this.database, lookup.tenantId, async (transaction) => {
      const rows = parseRows(
        await transaction.execute(sql`
          SELECT id, tenant_id, agent_id, connection_id, guest_id, token_hash, token_kid,
            issued_at, expires_at, revoked_at, last_used_at, created_at
          FROM guest_sessions
          WHERE tenant_id = ${lookup.tenantId}
            AND token_hash = ${lookup.tokenHash}
            AND revoked_at IS NULL
            AND expires_at > now()
          LIMIT 1
        `)
      );
      return rows[0];
    });
  }

  public async revoke(
    input: Readonly<{ tenantId: string; tokenHash: Uint8Array; revokedAt: Date }>
  ): Promise<boolean> {
    const revocation = GuestSessionRevocationSchema.parse(input);

    return withTenant(this.database, revocation.tenantId, (transaction) =>
      wasUpdated(transaction, sql`
        UPDATE guest_sessions
        SET revoked_at = ${revocation.revokedAt}
        WHERE tenant_id = ${revocation.tenantId}
          AND token_hash = ${revocation.tokenHash}
          AND revoked_at IS NULL
        RETURNING id
      `)
    );
  }

  public async markUsedByTokenHash(
    input: Readonly<{ tenantId: string; tokenHash: Uint8Array; lastUsedAt: Date }>
  ): Promise<boolean> {
    const usage = GuestSessionLastUseSchema.parse(input);

    return withTenant(this.database, usage.tenantId, (transaction) =>
      wasUpdated(transaction, sql`
        UPDATE guest_sessions
        SET last_used_at = ${usage.lastUsedAt}
        WHERE tenant_id = ${usage.tenantId}
          AND token_hash = ${usage.tokenHash}
          AND revoked_at IS NULL
          AND expires_at > ${usage.lastUsedAt}
        RETURNING id
      `)
    );
  }
}
