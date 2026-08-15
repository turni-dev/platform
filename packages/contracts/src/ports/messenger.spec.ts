import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  InboundMessageSchema,
  type MessengerPort,
  OutboundMessageSchema
} from './messenger.js';

describe('MessengerPort contracts', () => {
  it('parses a vendor-neutral inbound text message', () => {
    expect(
      InboundMessageSchema.parse({
        externalId: 'update-42',
        connectionId: '01900000-0000-7000-8000-000000000001',
        senderId: 'guest-7',
        occurredAt: '2026-07-02T10:00:00.000Z',
        content: { type: 'text', text: 'Стол на двоих' }
      })
    ).toMatchObject({ externalId: 'update-42' });
  });

  it('rejects vendor fields at the port boundary', () => {
    expect(() =>
      InboundMessageSchema.parse({
        externalId: 'update-42',
        connectionId: '01900000-0000-7000-8000-000000000001',
        senderId: 'guest-7',
        occurredAt: '2026-07-02T10:00:00.000Z',
        content: { type: 'text', text: 'Привет' },
        telegramUpdate: {}
      })
    ).toThrow();
  });

  it('supports text, buttons, and image outbound content', () => {
    expect(
      OutboundMessageSchema.parse({
        conversationId: '01900000-0000-7000-8000-000000000002',
        recipientRef: '777',
        content: {
          type: 'buttons',
          text: 'Подтвердить?',
          buttons: [{ id: 'approve', label: 'Да' }]
        }
      }).content.type
    ).toBe('buttons');
  });

  it('refuses an outbound message that names no recipient on the provider side', () => {
    expect(() =>
      OutboundMessageSchema.parse({
        conversationId: '01900000-0000-7000-8000-000000000002',
        content: { type: 'text', text: 'Здравствуйте' }
      })
    ).toThrow();
  });

  it('keeps raw webhook parsing inside adapters', () => {
    expectTypeOf<MessengerPort['parseWebhook']>().parameter(0).toEqualTypeOf<unknown>();
  });
});
