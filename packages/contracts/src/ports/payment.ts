import { z } from 'zod';
import {
  CurrencyCodeSchema,
  DecimalMoneySchema,
  UuidSchema
} from '../common.js';

export const CreateInvoiceRequestSchema = z.strictObject({
  tenantId: UuidSchema,
  idempotencyKey: z.string().min(1),
  amount: DecimalMoneySchema,
  currency: CurrencyCodeSchema,
  description: z.string().min(1)
});

export const InvoiceSchema = z.strictObject({
  id: z.string().min(1),
  status: z.enum(['pending', 'paid', 'cancelled']),
  checkoutUrl: z.url()
});

export const PaymentWebhookSchema = z.strictObject({
  eventId: z.string().min(1),
  paymentId: z.string().min(1)
});

export const PaymentSchema = z.strictObject({
  id: z.string().min(1),
  status: z.enum(['pending', 'paid', 'cancelled', 'refunded']),
  amount: DecimalMoneySchema,
  currency: CurrencyCodeSchema
});

export type CreateInvoiceRequest = z.infer<typeof CreateInvoiceRequestSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type PaymentWebhook = z.infer<typeof PaymentWebhookSchema>;
export type Payment = z.infer<typeof PaymentSchema>;

export interface PaymentPort {
  createInvoice(request: CreateInvoiceRequest): Promise<Invoice>;
  parseWebhook(raw: unknown): Promise<PaymentWebhook>;
  fetchPayment(id: string): Promise<Payment>;
}
