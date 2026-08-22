import { z } from 'zod';

export const UuidSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const CurrencyCodeSchema = z.string().regex(/^[A-Z]{3}$/);
export const DecimalMoneySchema = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);

export const ProblemType = {
  InvalidRequest: 'https://turni.ru/problems/invalid-request',
  Unauthorized: 'https://turni.ru/problems/unauthorized'
} as const;

/**
 * The RFC 7807 (`application/problem+json`) response shape used for every
 * HTTP error surface. `detail` and `instance` are optional per the RFC — a
 * problem may omit either when it would leak information a stranger should
 * not learn (see `entrypoints/http/problems.ts`).
 */
export const ProblemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number().int().min(100).max(599),
  detail: z.string().optional(),
  instance: z.string().optional()
});

export type Uuid = z.infer<typeof UuidSchema>;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;
export type DecimalMoney = z.infer<typeof DecimalMoneySchema>;
export type ProblemDetails = z.infer<typeof ProblemDetailsSchema>;
