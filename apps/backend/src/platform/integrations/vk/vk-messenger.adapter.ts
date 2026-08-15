import { createHash } from 'node:crypto';
import {
  InboundMessageSchema,
  MessengerConnectionSchema,
  MessengerCredentialsSchema,
  OutboundMessageSchema,
  type CredentialValidation,
  type InboundMessage,
  type MessengerConnection,
  type MessengerCredentials,
  type MessengerPort,
  type OutboundMessage,
  type SendMessageResult,
  type WebhookSetup
} from '@turni/contracts';
import { z } from 'zod';
import { VkApiClient, VkApiError, type FetchLike } from './vk-api-client.js';
import { parseVkCallback } from './vk-callback.js';

const GroupsByIdSchema = z.object({
  groups: z.array(z.object({ id: z.number().int(), name: z.string().min(1) })).min(1)
});
const ConfirmationCodeSchema = z.object({ code: z.string().min(1) });
const SentMessageIdSchema = z.number().int().positive();
const AddedServerSchema = z.object({ server_id: z.number().int().positive() });

/** VK caps a callback server title at 14 characters. */
const serverTitle = 'Turni';

/**
 * VK wants a positive 32-bit integer and treats a repeated one as the same
 * message. Seeding it with the reply itself means a retried callback produces
 * the identical identifier, so the guest never receives a second copy.
 */
export function deriveRandomId(seed: string): number {
  return (createHash('sha256').update(seed).digest().readUInt32BE(0) % 2_147_483_646) + 1;
}

export class VkMessengerAdapter implements MessengerPort {
  public constructor(
    private readonly client: VkApiClient,
    private readonly groupId: number,
    private readonly connectionId?: string
  ) {}

  /** A wrong key is an answer, not an exception: the wizard shows the owner a
   * refusal rather than a stack trace. A broken transport still throws. */
  public async validateCredentials(
    credentials: MessengerCredentials
  ): Promise<CredentialValidation> {
    MessengerCredentialsSchema.parse(credentials);

    try {
      const groups = GroupsByIdSchema.parse(
        await this.client.call('groups.getById', { group_ids: this.groupId })
      );

      return { valid: true, identity: groups.groups[0]!.name };
    } catch (error) {
      if (error instanceof VkApiError) {
        return { valid: false };
      }

      throw error;
    }
  }

  public async send(
    connection: MessengerConnection,
    message: OutboundMessage
  ): Promise<SendMessageResult> {
    MessengerConnectionSchema.parse(connection);
    const parsed = OutboundMessageSchema.parse(message);
    if (parsed.content.type !== 'text') {
      throw new Error('The VK channel carries text only');
    }

    const sent = SentMessageIdSchema.parse(
      await this.client.call('messages.send', {
        peer_id: parsed.recipientRef,
        message: parsed.content.text,
        random_id: deriveRandomId(
          `${parsed.conversationId}:${parsed.recipientRef}:${parsed.content.text}`
        )
      })
    );

    return { externalId: String(sent) };
  }

  /**
   * Only a new message becomes an inbound message, and only when this adapter
   * was built for a known connection: a message that cannot say where it
   * arrived is not one we can answer.
   */
  public parseWebhook(raw: unknown): Promise<InboundMessage> {
    const callback = parseVkCallback(raw);
    if (callback.type !== 'message_new' || this.connectionId === undefined) {
      return Promise.reject(new Error('This callback is not an addressable message'));
    }

    return Promise.resolve(
      InboundMessageSchema.parse({
        externalId: callback.eventId,
        connectionId: this.connectionId,
        senderId: callback.senderId,
        occurredAt: new Date().toISOString(),
        content: { type: 'text', text: callback.text }
      })
    );
  }

  /** Registers our callback URL, then enables message events on the server we
   * just registered — not on whichever one VK happens to list first. */
  public async setupWebhook(
    connection: MessengerConnection,
    setup: WebhookSetup
  ): Promise<void> {
    MessengerConnectionSchema.parse(connection);

    const added = AddedServerSchema.parse(
      await this.client.call('groups.addCallbackServer', {
        group_id: this.groupId,
        url: setup.url,
        title: serverTitle,
        secret_key: setup.secret
      })
    );

    await this.client.call('groups.setCallbackSettings', {
      group_id: this.groupId,
      server_id: added.server_id,
      message_new: 1
    });
  }

  public async confirmationCode(): Promise<string> {
    return ConfirmationCodeSchema.parse(
      await this.client.call('groups.getCallbackConfirmationCode', {
        group_id: this.groupId
      })
    ).code;
  }
}

export function createVkMessenger(
  input: Readonly<{
    accessKey: string;
    groupId: number;
    connectionId?: string;
    fetch?: FetchLike;
  }>
): VkMessengerAdapter {
  return new VkMessengerAdapter(
    new VkApiClient({
      accessKey: input.accessKey,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch })
    }),
    input.groupId,
    input.connectionId
  );
}
