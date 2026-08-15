import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  withTenant,
  type TenantDatabase,
  type TenantTransaction
} from '../../../../platform/database/with-tenant.js';
import { timestampParam } from '../../../../platform/database/sql-timestamp.js';
import {
  ConversationResolutionSchema,
  GuestResolutionSchema,
  MessageAppendSchema,
  type ConversationResolution,
  type GuestConversationStorePort,
  type GuestResolution,
  type MessageAppend
} from '../../application/guest-conversation-store.port.js';

const IdRowsSchema = z.array(z.strictObject({ id: z.uuidv7() }));
const SequenceRowsSchema = z.array(z.strictObject({ next_seq: z.union([z.bigint(), z.number(), z.string()]) }));

async function singleId(
  transaction: TenantTransaction,
  query: ReturnType<typeof sql>
): Promise<string | undefined> {
  return IdRowsSchema.parse(await transaction.execute(query))[0]?.id;
}

export class PostgresGuestConversationStore implements GuestConversationStorePort {
  public constructor(private readonly database: TenantDatabase) {}

  /**
   * Upserts on the channel reference index, so two callbacks racing for the
   * same new guest end with one row rather than a violation.
   */
  public async resolveGuest(input: GuestResolution): Promise<string> {
    const resolution = GuestResolutionSchema.parse(input);

    return withTenant(this.database, resolution.tenantId, async (transaction) => {
      const inserted = await singleId(
        transaction,
        sql`
          INSERT INTO guests (id, tenant_id, meta, last_seen_at)
          VALUES (
            ${resolution.guestId}, ${resolution.tenantId},
            ${JSON.stringify({ channel_ref: resolution.channelRef })}::jsonb,
            ${timestampParam(resolution.seenAt)}
          )
          ON CONFLICT (tenant_id, (meta ->> 'channel_ref')) WHERE meta ? 'channel_ref'
          DO UPDATE SET last_seen_at = ${timestampParam(resolution.seenAt)}
          RETURNING id
        `
      );

      if (inserted === undefined) {
        throw new Error('A guest could neither be created nor found');
      }

      return inserted;
    });
  }

  /** One open thread per guest per connection; a closed one is left alone and
   * a new one starts. */
  public async resolveConversation(input: ConversationResolution): Promise<string> {
    const resolution = ConversationResolutionSchema.parse(input);

    return withTenant(this.database, resolution.tenantId, async (transaction) => {
      const existing = await singleId(
        transaction,
        sql`
          SELECT id FROM conversations
          WHERE tenant_id = ${resolution.tenantId}
            AND connection_id = ${resolution.connectionId}
            AND guest_id = ${resolution.guestId}
            AND status = 'active'
          ORDER BY created_at DESC
          LIMIT 1
        `
      );
      if (existing !== undefined) {
        return existing;
      }

      const created = await singleId(
        transaction,
        sql`
          INSERT INTO conversations (
            id, tenant_id, agent_id, guest_id, connection_id, status
          ) VALUES (
            ${resolution.conversationId}, ${resolution.tenantId}, ${resolution.agentId},
            ${resolution.guestId}, ${resolution.connectionId}, 'active'
          )
          RETURNING id
        `
      );
      if (created === undefined) {
        throw new Error('A conversation could not be created');
      }

      return created;
    });
  }

  /** Takes the sequence from the conversation row and moves it in the same
   * transaction, which is what makes (conversation_id, seq) safe to be unique. */
  public async appendMessage(input: MessageAppend): Promise<void> {
    const message = MessageAppendSchema.parse(input);

    await withTenant(this.database, message.tenantId, async (transaction) => {
      const rows = SequenceRowsSchema.parse(
        await transaction.execute(sql`
          UPDATE conversations
          SET next_seq = next_seq + 1, last_msg_at = now()
          WHERE tenant_id = ${message.tenantId} AND id = ${message.conversationId}
          RETURNING next_seq
        `)
      );
      const next = rows[0]?.next_seq;
      if (next === undefined) {
        throw new Error('A message was appended to a conversation that does not exist');
      }

      await transaction.execute(sql`
        INSERT INTO messages (id, conversation_id, tenant_id, seq, role, content)
        VALUES (
          ${message.messageId}, ${message.conversationId}, ${message.tenantId},
          ${String(next)}::bigint, ${message.role}, ${message.content}
        )
      `);
    });
  }
}
