import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantDatabase } from '../../../../platform/database/with-tenant.js';
import {
  WebhookInboxClaimSchema,
  type WebhookInboxClaim,
  type WebhookInboxPort
} from '../../application/webhook-inbox.port.js';

const ClaimedRowsSchema = z.array(z.strictObject({ id: z.uuidv7() }));
const MarkSchema = z.strictObject({
  source: z.enum(['telegram', 'yookassa', 'vk']),
  externalId: z.string().min(1)
});
const FailureSchema = MarkSchema.extend({ error: z.string().min(1).max(200) });

/**
 * The one repository here that does not run through `withTenant`: webhook_inbox
 * has no tenant column and no row-level security, because a callback is
 * recognized before we know whose it is. Nothing tenant-scoped is read or
 * written from this class.
 */
export class PostgresWebhookInbox implements WebhookInboxPort {
  public constructor(private readonly database: TenantDatabase) {}

  /**
   * Claiming and the retry rule are one statement. A row that is still
   * `received` or already `processed` yields nothing, so the caller stops; a
   * row left `failed` by an earlier attempt is taken over, so the provider's
   * retry is the redelivery mechanism.
   */
  public async claim(claim: WebhookInboxClaim): Promise<'claimed' | 'duplicate'> {
    const parsed = WebhookInboxClaimSchema.parse(claim);

    return this.database.transaction(async (transaction) => {
      const rows = ClaimedRowsSchema.parse(
        await transaction.execute(sql`
          INSERT INTO webhook_inbox (id, source, external_id, payload, status)
          VALUES (
            ${parsed.id}, ${parsed.source}, ${parsed.externalId},
            ${JSON.stringify(parsed.payload)}::jsonb, 'received'
          )
          ON CONFLICT (source, external_id) DO UPDATE
            SET status = 'received', error = NULL
            WHERE webhook_inbox.status = 'failed'
          RETURNING id
        `)
      );

      return rows.length === 1 ? 'claimed' : 'duplicate';
    });
  }

  public async markProcessed(
    input: Readonly<{ source: string; externalId: string }>
  ): Promise<void> {
    const mark = MarkSchema.parse(input);

    await this.database.transaction((transaction) =>
      transaction
        .execute(
          sql`
            UPDATE webhook_inbox
            SET status = 'processed', error = NULL
            WHERE source = ${mark.source} AND external_id = ${mark.externalId}
          `
        )
        .then(() => undefined)
    );
  }

  /** The stored reason is a class name, never a payload or a message body. */
  public async markFailed(
    input: Readonly<{ source: string; externalId: string; error: string }>
  ): Promise<void> {
    const failure = FailureSchema.parse(input);

    await this.database.transaction((transaction) =>
      transaction
        .execute(
          sql`
            UPDATE webhook_inbox
            SET status = 'failed', error = ${failure.error}
            WHERE source = ${failure.source} AND external_id = ${failure.externalId}
          `
        )
        .then(() => undefined)
    );
  }
}
