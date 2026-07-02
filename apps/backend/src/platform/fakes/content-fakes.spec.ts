import { describe, expect, it } from 'vitest';
import { FakeBlob, FakeCms, FakeEmail, FakeNotify } from './content-fakes.js';

describe('content fake adapters', () => {
  it('round-trips binary blobs and deletes them', async () => {
    const fake = new FakeBlob();
    await fake.put({
      key: 'exports/demo.bin',
      body: new Uint8Array([1, 2, 3]),
      contentType: 'application/octet-stream'
    });

    expect((await fake.get('exports/demo.bin')).body).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(await fake.signedUrl({ key: 'exports/demo.bin', expiresInSeconds: 60 }))
      .toContain('exports%2Fdemo.bin');
    await fake.delete('exports/demo.bin');
    await expect(fake.get('exports/demo.bin')).rejects.toThrow();
  });

  it('routes fake owner notifications deterministically', async () => {
    const fake = new FakeNotify();
    const result = await fake.notifyOwner(
      {
        id: '01900000-0000-7000-8000-000000000001',
        tenantId: '01900000-0000-7000-8000-000000000002',
        telegramChatId: '12345'
      },
      {
        category: 'approval',
        title: 'Решение',
        body: 'Проверьте карточку',
        data: {}
      }
    );

    expect(result.channel).toBe('telegram');
    expect(fake.sent).toHaveLength(1);
  });

  it('records transactional email without sending it', async () => {
    const fake = new FakeEmail();
    const result = await fake.send({
      to: 'owner@example.ru',
      template: 'auth-code',
      data: { code: '123456' }
    });

    expect(result.messageId).toBe('fake-email-1');
    expect(fake.sent[0]?.template).toBe('auth-code');
  });

  it('serves configured CMS pages and collections', async () => {
    const fake = new FakeCms(
      [{ slug: 'home', title: 'Turni', blocks: [] }],
      { faq: [{ id: 'faq-1', fields: { question: 'Что такое Turni?' } }] }
    );

    expect((await fake.getPage('home'))?.title).toBe('Turni');
    expect(await fake.getPage('missing')).toBeNull();
    expect(await fake.getCollection('faq')).toHaveLength(1);
  });
});
