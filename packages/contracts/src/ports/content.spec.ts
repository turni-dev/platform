import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  BlobPutRequestSchema,
  type BlobPort,
  CmsPageSchema,
  type CmsPort,
  EmailRequestSchema,
  type EmailPort,
  type EmailResult,
  NotificationSchema,
  type NotificationResult,
  type NotifyPort
} from './content.js';

describe('content and notification port contracts', () => {
  it('keeps blob bodies binary', () => {
    const body = new Uint8Array([1, 2, 3]);

    expect(
      BlobPutRequestSchema.parse({
        key: 'tenant/export.parquet',
        body,
        contentType: 'application/octet-stream'
      }).body
    ).toBe(body);
    expect(() =>
      BlobPutRequestSchema.parse({
        key: 'tenant/export.parquet',
        body: 'base64-data',
        contentType: 'application/octet-stream'
      })
    ).toThrow();
  });

  it('defines the complete blob lifecycle', () => {
    expectTypeOf<BlobPort>().toHaveProperty('put');
    expectTypeOf<BlobPort>().toHaveProperty('get');
    expectTypeOf<BlobPort>().toHaveProperty('signedUrl');
    expectTypeOf<BlobPort>().toHaveProperty('delete');
  });

  it('uses tenant-neutral notification data', () => {
    expect(
      NotificationSchema.parse({
        category: 'approval',
        title: 'Нужно решение',
        body: 'Проверьте ответ гостю',
        data: { approvalId: '01900000-0000-7000-8000-000000000001' }
      }).category
    ).toBe('approval');
    expectTypeOf<NotifyPort['notifyOwner']>()
      .returns.toEqualTypeOf<Promise<NotificationResult>>();
  });

  it('validates the branded transactional email envelope', () => {
    expect(
      EmailRequestSchema.parse({
        to: 'owner@example.ru',
        template: 'auth-code',
        data: { code: '123456' },
        replyTo: 'support@turni.ru'
      }).template
    ).toBe('auth-code');
    expectTypeOf<EmailPort['send']>()
      .returns.toEqualTypeOf<Promise<EmailResult>>();
  });

  it('rejects vendor CMS fields', () => {
    expect(() =>
      CmsPageSchema.parse({
        slug: 'home',
        title: 'Turni',
        blocks: [],
        strapiDocumentId: 'vendor-id'
      })
    ).toThrow();
    expectTypeOf<CmsPort>().toHaveProperty('getCollection');
  });
});
