import { z } from 'zod';

/** Категории каталога ровно те, что заведены в CMS: витрина не выдумывает свои. */
export const INTEGRATION_CATEGORIES = [
  'calendar',
  'docs',
  'messengers',
  'mail',
  'crm',
  'other'
] as const;

export const INTEGRATION_STATUSES = ['available', 'in_progress', 'on_request'] as const;

export const CATEGORY_LABELS: Readonly<Record<IntegrationCategory, string>> = {
  calendar: 'Календари',
  docs: 'Документы',
  messengers: 'Мессенджеры',
  mail: 'Почта',
  crm: 'CRM',
  other: 'Другое'
};

export const STATUS_LABELS: Readonly<Record<IntegrationStatus, string>> = {
  available: 'Работает',
  in_progress: 'В работе',
  on_request: 'По запросу'
};

/**
 * Логотип приходит либо строкой (тесты и семена), либо media-объектом Strapi.
 * Наружу в обоих случаях отдаётся адрес — как и в настройках сайта.
 */
const LogoSchema = z.union([
  z.string().min(1),
  z.object({ url: z.string().min(1) }).transform((media) => media.url)
]);

/**
 * Слаг интеграции: латиница в нижнем регистре, цифры и дефисы. Тем же
 * правилом проверяется значение `requested_integration` в заявке — заявка
 * ссылается ровно на то, что может существовать в каталоге, а не на
 * произвольный текст произвольной длины.
 */
export const IntegrationSlugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, 'слаг только латиницей в нижнем регистре');

/**
 * Карточка интеграции. `permissionsAsked` обязательное: интеграция без ответа
 * «какие права запрашиваем и зачем» на витрину не выходит — это требование
 * спеки, а не оформление.
 */
export const IntegrationSchema = z.object({
  slug: IntegrationSlugSchema,
  name: z.string().min(1).max(80),
  category: z.enum(INTEGRATION_CATEGORIES),
  summary: z.string().min(1).max(160),
  whatItCan: z.string().min(1),
  permissionsAsked: z.string().min(1),
  status: z.enum(INTEGRATION_STATUSES),
  logo: LogoSchema.optional(),
  order: z.number().int().optional()
});

export type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number];
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export type Integration = z.infer<typeof IntegrationSchema>;
