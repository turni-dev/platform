import { z } from 'zod';
import { IsoDateTimeSchema, UuidSchema } from '../common.js';

export const MessengerConnectionSchema = z.strictObject({
  id: UuidSchema,
  type: z.enum(['telegram', 'widget'])
});

export const MessageButtonSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1)
});

export const MessageContentSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('text'),
    text: z.string().min(1)
  }),
  z.strictObject({
    type: z.literal('buttons'),
    text: z.string().min(1),
    buttons: z.array(MessageButtonSchema).min(1)
  }),
  z.strictObject({
    type: z.literal('image'),
    url: z.url(),
    alt: z.string().min(1).optional()
  })
]);

export const InboundMessageSchema = z.strictObject({
  externalId: z.string().min(1),
  connectionId: UuidSchema,
  senderId: z.string().min(1),
  occurredAt: IsoDateTimeSchema,
  content: MessageContentSchema
});

export const OutboundMessageSchema = z.strictObject({
  conversationId: UuidSchema,
  content: MessageContentSchema
});

export const SendMessageResultSchema = z.strictObject({
  externalId: z.string().min(1)
});

export const WebhookSetupSchema = z.strictObject({
  url: z.url(),
  secret: z.string().min(16)
});

export const MessengerCredentialsSchema = z.strictObject({
  secret: z.string().min(1)
});

export const CredentialValidationSchema = z.strictObject({
  valid: z.boolean(),
  identity: z.string().min(1).optional()
});

export type MessengerConnection = z.infer<typeof MessengerConnectionSchema>;
export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;
export type SendMessageResult = z.infer<typeof SendMessageResultSchema>;
export type WebhookSetup = z.infer<typeof WebhookSetupSchema>;
export type MessengerCredentials = z.infer<typeof MessengerCredentialsSchema>;
export type CredentialValidation = z.infer<typeof CredentialValidationSchema>;

export interface MessengerPort {
  send(
    connection: MessengerConnection,
    message: OutboundMessage
  ): Promise<SendMessageResult>;
  parseWebhook(raw: unknown): Promise<InboundMessage>;
  setupWebhook(
    connection: MessengerConnection,
    setup: WebhookSetup
  ): Promise<void>;
  validateCredentials(
    credentials: MessengerCredentials
  ): Promise<CredentialValidation>;
}
