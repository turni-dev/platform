import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  CreateInvoiceRequestSchema,
  type PaymentPort,
  PaymentSchema
} from './payment.js';

describe('PaymentPort contracts', () => {
  it('uses decimal strings for money', () => {
    expect(
      CreateInvoiceRequestSchema.parse({
        tenantId: '01900000-0000-7000-8000-000000000001',
        idempotencyKey: 'invoice-2026-07',
        amount: '4990.00',
        currency: 'RUB',
        description: 'Turni Start'
      }).amount
    ).toBe('4990.00');
    expect(() =>
      CreateInvoiceRequestSchema.parse({
        tenantId: '01900000-0000-7000-8000-000000000001',
        idempotencyKey: 'invoice-2026-07',
        amount: 4990,
        currency: 'RUB',
        description: 'Turni Start'
      })
    ).toThrow();
  });

  it('uses checked internal payment statuses', () => {
    expect(
      PaymentSchema.parse({
        id: 'provider-payment-1',
        status: 'paid',
        amount: '4990.00',
        currency: 'RUB'
      }).status
    ).toBe('paid');
  });

  it('accepts raw payment webhooks only as unknown', () => {
    expectTypeOf<PaymentPort['parseWebhook']>().parameter(0).toEqualTypeOf<unknown>();
  });
});
