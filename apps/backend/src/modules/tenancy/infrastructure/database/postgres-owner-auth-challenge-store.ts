import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type {
  TenantDatabase,
  TenantTransaction
} from '../../../../platform/database/with-tenant.js';
import {
  parseOwnerAuthChallengeRecord,
  type OwnerAuthChallengeRecord,
  type OwnerAuthChallengeStorePort
} from '../../application/owner-auth-challenge-store.port.js';
import {
  maxOwnerAuthAttempts,
  normalizeOwnerEmail
} from '../../domain/owner-auth-challenge.js';

// `auth_codes` is the single pre-tenant bootstrap table: a challenge is issued
// before the requester is known to belong to any tenant, so it carries no
// tenant_id and no RLS policy. Every row it leads to is created through
// `withTenant` afterwards.

const LookupSchema = z.strictObject({
  email: z.string(),
  now: z.date()
});
const AttemptSchema = z.strictObject({ id: z.uuidv7(), now: z.date() });
const ConsumptionSchema = z.strictObject({ id: z.uuidv7(), consumedAt: z.date() });

const ChallengeRowSchema = z.strictObject({
  id: z.uuidv7(),
  email: z.string(),
  code_hash: z.string(),
  attempts: z.number().int(),
  expires_at: z.date(),
  consumed_at: z.date().nullable()
});
const AttemptRowsSchema = z.array(z.strictObject({ attempts: z.number().int() }));
const ConsumedRowsSchema = z.array(z.strictObject({ id: z.uuidv7() }));

export class PostgresOwnerAuthChallengeStore implements OwnerAuthChallengeStorePort {
  public constructor(private readonly database: TenantDatabase) {}

  public async insert(input: OwnerAuthChallengeRecord): Promise<void> {
    const challenge = parseOwnerAuthChallengeRecord({
      ...input,
      email: normalizeOwnerEmail(input.email)
    });

    await this.database.transaction((transaction) =>
      transaction
        .execute(sql`
          INSERT INTO auth_codes (id, email, code_hash, expires_at)
          VALUES (
            ${challenge.id}, ${challenge.email}, ${challenge.codeHash},
            ${challenge.expiresAt}
          )
        `)
        .then(() => undefined)
    );
  }

  public async findActiveByEmail(
    input: Readonly<{ email: string; now: Date }>
  ): Promise<OwnerAuthChallengeRecord | undefined> {
    const lookup = LookupSchema.parse(input);
    const email = normalizeOwnerEmail(lookup.email);

    return this.database.transaction(async (transaction) => {
      const rows = z
        .array(ChallengeRowSchema)
        .parse(
          await transaction.execute(sql`
            SELECT id, email, code_hash, attempts, expires_at, consumed_at
            FROM auth_codes
            WHERE email = ${email}
              AND consumed_at IS NULL
              AND expires_at > ${lookup.now}
            ORDER BY created_at DESC
            LIMIT 1
          `)
        )
        .map((row) =>
          parseOwnerAuthChallengeRecord({
            id: row.id,
            email: row.email,
            codeHash: row.code_hash,
            attempts: row.attempts,
            expiresAt: row.expires_at,
            ...(row.consumed_at === null ? {} : { consumedAt: row.consumed_at })
          })
        );

      return rows[0];
    });
  }

  public async incrementAttempts(
    input: Readonly<{ id: string; now: Date }>
  ): Promise<number | undefined> {
    const attempt = AttemptSchema.parse(input);

    return this.transactionRows(
      sql`
        UPDATE auth_codes
        SET attempts = attempts + 1
        WHERE id = ${attempt.id}
          AND consumed_at IS NULL
          AND expires_at > ${attempt.now}
          AND attempts < ${maxOwnerAuthAttempts}
        RETURNING attempts
      `,
      (rows) => AttemptRowsSchema.parse(rows)[0]?.attempts
    );
  }

  public async consume(
    input: Readonly<{ id: string; consumedAt: Date }>
  ): Promise<boolean> {
    const consumption = ConsumptionSchema.parse(input);

    return this.transactionRows(
      sql`
        UPDATE auth_codes
        SET consumed_at = ${consumption.consumedAt}
        WHERE id = ${consumption.id}
          AND consumed_at IS NULL
          AND expires_at > ${consumption.consumedAt}
        RETURNING id
      `,
      (rows) => ConsumedRowsSchema.parse(rows).length === 1
    );
  }

  private transactionRows<T>(
    query: ReturnType<typeof sql>,
    project: (rows: unknown) => T
  ): Promise<T> {
    return this.database.transaction(async (transaction: TenantTransaction) =>
      project(await transaction.execute(query))
    );
  }
}
