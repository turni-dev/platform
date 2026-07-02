import {
  BlobObjectSchema,
  BlobPutRequestSchema,
  BlobReferenceSchema,
  CmsEntrySchema,
  CmsPageSchema,
  EmailRequestSchema,
  EmailResultSchema,
  NotificationResultSchema,
  NotificationSchema,
  OwnerRecipientSchema,
  SignedUrlRequestSchema,
  type BlobObject,
  type BlobPort,
  type BlobPutRequest,
  type BlobReference,
  type CmsEntry,
  type CmsPage,
  type CmsPort,
  type EmailPort,
  type EmailRequest,
  type EmailResult,
  type Notification,
  type NotificationResult,
  type NotifyPort,
  type OwnerRecipient,
  type SignedUrlRequest
} from '@turni/contracts';
import { z } from 'zod';

export class FakeBlob implements BlobPort {
  private readonly objects = new Map<string, BlobObject>();
  private sequence = 0;

  put(request: BlobPutRequest): Promise<BlobReference> {
    const parsed = BlobPutRequestSchema.parse(request);
    this.sequence += 1;
    const object = BlobObjectSchema.parse({
      key: parsed.key,
      body: new Uint8Array(parsed.body),
      contentType: parsed.contentType,
      metadata: parsed.metadata ?? {}
    });
    this.objects.set(parsed.key, object);
    return Promise.resolve(
      BlobReferenceSchema.parse({
        key: parsed.key,
        etag: `fake-etag-${this.sequence}`,
        size: parsed.body.byteLength
      })
    );
  }

  get(key: string): Promise<BlobObject> {
    const validKey = z.string().min(1).parse(key);
    const object = this.objects.get(validKey);
    if (!object) {
      return Promise.reject(new Error(`Unknown fake blob: ${validKey}`));
    }
    return Promise.resolve(
      BlobObjectSchema.parse({ ...object, body: new Uint8Array(object.body) })
    );
  }

  signedUrl(request: SignedUrlRequest): Promise<string> {
    const parsed = SignedUrlRequestSchema.parse(request);
    return Promise.resolve(
      `https://fake.turni.local/blob/${encodeURIComponent(parsed.key)}?ttl=${parsed.expiresInSeconds}`
    );
  }

  delete(key: string): Promise<void> {
    this.objects.delete(z.string().min(1).parse(key));
    return Promise.resolve();
  }
}

export type SentNotification = Readonly<{
  recipient: OwnerRecipient;
  notification: Notification;
}>;

export class FakeNotify implements NotifyPort {
  private readonly notifications: SentNotification[] = [];

  get sent(): readonly SentNotification[] {
    return this.notifications;
  }

  notifyOwner(
    recipient: OwnerRecipient,
    notification: Notification
  ): Promise<NotificationResult> {
    const parsedRecipient = OwnerRecipientSchema.parse(recipient);
    const parsedNotification = NotificationSchema.parse(notification);
    this.notifications.push({
      recipient: parsedRecipient,
      notification: parsedNotification
    });
    return Promise.resolve(
      NotificationResultSchema.parse({
        channel: parsedRecipient.telegramChatId ? 'telegram' : 'email',
        externalId: `fake-notification-${this.notifications.length}`
      })
    );
  }
}

export class FakeEmail implements EmailPort {
  private readonly emails: EmailRequest[] = [];

  get sent(): readonly EmailRequest[] {
    return this.emails;
  }

  send(request: EmailRequest): Promise<EmailResult> {
    this.emails.push(EmailRequestSchema.parse(request));
    return Promise.resolve(
      EmailResultSchema.parse({ messageId: `fake-email-${this.emails.length}` })
    );
  }
}

export class FakeCms implements CmsPort {
  private readonly pages = new Map<string, CmsPage>();
  private readonly collections = new Map<string, readonly CmsEntry[]>();

  constructor(
    pages: readonly CmsPage[] = [],
    collections: Readonly<Record<string, readonly CmsEntry[]>> = {}
  ) {
    for (const page of pages) {
      const parsed = CmsPageSchema.parse(page);
      this.pages.set(parsed.slug, parsed);
    }
    for (const [type, entries] of Object.entries(collections)) {
      this.collections.set(type, entries.map((entry) => CmsEntrySchema.parse(entry)));
    }
  }

  getPage(slug: string): Promise<CmsPage | null> {
    return Promise.resolve(this.pages.get(z.string().min(1).parse(slug)) ?? null);
  }

  getCollection(type: string): Promise<readonly CmsEntry[]> {
    return Promise.resolve(
      this.collections.get(z.string().min(1).parse(type)) ?? []
    );
  }
}
