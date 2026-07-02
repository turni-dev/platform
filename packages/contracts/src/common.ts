import { z } from 'zod';

export const UuidSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
export const DecimalMoneySchema = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);

export type Uuid = z.infer<typeof UuidSchema>;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
export type DecimalMoney = z.infer<typeof DecimalMoneySchema>;
