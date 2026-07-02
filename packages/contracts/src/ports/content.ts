import { z } from 'zod';
import { UuidSchema } from '../common.js';

const StringRecordSchema = z.record(z.string(), z.unknown());

export const BlobPutRequestSchema = z.strictObject({
  key: z.string().min(1),
  body: z.instanceof(Uint8Array),
  contentType: z.string().min(1),
  metadata: z.record(z.string(), z.string()).optional()
});

export const BlobReferenceSchema = z.strictObject({
  key: z.string().min(1),
  etag: z.string().min(1),
  size: z.number().int().nonnegative()
});

export const BlobObjectSchema = z.strictObject({
  key: z.string().min(1),
  body: z.instanceof(Uint8Array),
  contentType: z.string().min(1),
  metadata: z.record(z.string(), z.string())
});

export const SignedUrlRequestSchema = z.strictObject({
  key: z.string().min(1),
  expiresInSeconds: z.number().int().positive().max(86_400)
});

export type BlobPutRequest = z.infer<typeof BlobPutRequestSchema>;
export type BlobReference = z.infer<typeof BlobReferenceSchema>;
export type BlobObject = z.infer<typeof BlobObjectSchema>;
export type SignedUrlRequest = z.infer<typeof SignedUrlRequestSchema>;

export interface BlobPort {
  put(request: BlobPutRequest): Promise<BlobReference>;
  get(key: string): Promise<BlobObject>;
  signedUrl(request: SignedUrlRequest): Promise<string>;
  delete(key: string): Promise<void>;
}

export const OwnerRecipientSchema = z
  .strictObject({
    id: UuidSchema,
    tenantId: UuidSchema,
    email: z.email().optional(),
    telegramChatId: z.string().min(1).optional()
  })
  .refine((recipient) => recipient.email || recipient.telegramChatId, {
    message: 'At least one notification channel is required'
  });

export const NotificationSchema = z.strictObject({
  category: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  data: StringRecordSchema.default({})
});

export const NotificationResultSchema = z.strictObject({
  channel: z.enum(['telegram', 'email']),
  externalId: z.string().min(1)
});

export type OwnerRecipient = z.infer<typeof OwnerRecipientSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type NotificationResult = z.infer<typeof NotificationResultSchema>;

export interface NotifyPort {
  notifyOwner(
    recipient: OwnerRecipient,
    notification: Notification
  ): Promise<NotificationResult>;
}

export const EmailRequestSchema = z.strictObject({
  to: z.email(),
  template: z.string().min(1),
  data: StringRecordSchema,
  replyTo: z.email().optional()
});

export const EmailResultSchema = z.strictObject({
  messageId: z.string().min(1)
});

export type EmailRequest = z.infer<typeof EmailRequestSchema>;
export type EmailResult = z.infer<typeof EmailResultSchema>;

export interface EmailPort {
  send(request: EmailRequest): Promise<EmailResult>;
}

export const CmsBlockSchema = StringRecordSchema;
export const CmsPageSchema = z.strictObject({
  slug: z.string().min(1),
  title: z.string().min(1),
  blocks: z.array(CmsBlockSchema)
});
export const CmsEntrySchema = z.strictObject({
  id: z.string().min(1),
  fields: StringRecordSchema
});

export type CmsPage = z.infer<typeof CmsPageSchema>;
export type CmsEntry = z.infer<typeof CmsEntrySchema>;

export interface CmsPort {
  getPage(slug: string): Promise<CmsPage | null>;
  getCollection(type: string): Promise<readonly CmsEntry[]>;
}
