import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import {
  FakeEmbedding,
  FakeLlm,
  FakeMessenger,
  FakePayment
} from './core-fakes.js';

describe('core fake adapters', () => {
  it('returns configured structured LLM output', async () => {
    const fake = new FakeLlm({ intent: 'booking' });
    const outputSchema = z.strictObject({ intent: z.literal('booking') });

    const response = await fake.classify({
      role: 'classify',
      messages: [{ role: 'user', content: 'Нужен столик' }],
      outputSchema
    });

    expect(response.output).toEqual({ intent: 'booking' });
    expect(fake.requests).toHaveLength(1);
  });

  it('returns deterministic 768-dimensional embeddings', async () => {
    const fake = new FakeEmbedding();

    const first = await fake.embed({ texts: ['Меню'] });
    const second = await fake.embed({ texts: ['Меню'] });

    expect(first).toEqual(second);
    expect(first.vectors[0]).toHaveLength(768);
  });

  it('records normalized messenger sends and parses normalized webhooks', async () => {
    const fake = new FakeMessenger();
    const connection = {
      id: '01900000-0000-7000-8000-000000000001',
      type: 'telegram' as const
    };

    const sent = await fake.send(connection, {
      conversationId: '01900000-0000-7000-8000-000000000002',
      recipientRef: '777',
      content: { type: 'text', text: 'Подтверждено' }
    });
    const inbound = await fake.parseWebhook({
      externalId: 'update-1',
      connectionId: connection.id,
      senderId: 'guest-1',
      occurredAt: '2026-07-02T10:00:00.000Z',
      content: { type: 'text', text: 'Спасибо' }
    });

    expect(sent.externalId).toBe('fake-message-1');
    expect(fake.sent).toHaveLength(1);
    expect(inbound.externalId).toBe('update-1');
    await fake.setupWebhook(connection, {
      url: 'https://example.test/webhook',
      secret: '1234567890abcdef'
    });
    expect(await fake.validateCredentials({ secret: 'token' })).toMatchObject({
      valid: true,
      identity: 'fake-bot'
    });
    expect(await fake.validateCredentials({ secret: 'invalid' })).toEqual({
      valid: false
    });
  });

  it('returns paid fake invoices and fetched payments', async () => {
    const fake = new FakePayment();
    const invoice = await fake.createInvoice({
      tenantId: '01900000-0000-7000-8000-000000000001',
      idempotencyKey: 'invoice-1',
      amount: '4990.00',
      currency: 'RUB',
      description: 'Turni Start'
    });
    const payment = await fake.fetchPayment(invoice.id);

    expect(invoice.status).toBe('paid');
    expect(payment.status).toBe('paid');
    expect(
      await fake.parseWebhook({ eventId: 'event-1', paymentId: invoice.id })
    ).toMatchObject({ eventId: 'event-1' });
    await expect(fake.fetchPayment('missing')).rejects.toThrow();
  });
});
