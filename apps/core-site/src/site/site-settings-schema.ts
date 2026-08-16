import { z } from 'zod';
import { LinkSchema } from '../blocks/shared';

/** Пункт меню с одним уровнем вложенности: «Продукт → Кабинет, Виджет». */
export const NavItemSchema = LinkSchema.extend({
  children: z.array(LinkSchema).optional()
});

/**
 * Картинка приходит либо строкой (семя), либо media-объектом Strapi.
 * Наружу в обоих случаях отдаётся адрес.
 */
const ImageSchema = z.union([
  z.string().min(1),
  z.object({ url: z.string().min(1) }).transform((image) => image.url)
]);

/**
 * Поля именно такие, какими их заводит `@strapi/plugin-seo`: редактор видит
 * привычную панель с превью сниппета, а мы не держим свой параллельный формат.
 */
export const SeoSchema = z.object({
  metaTitle: z.string().min(1).optional(),
  metaDescription: z.string().min(1).optional(),
  metaImage: ImageSchema.optional(),
  metaRobots: z.string().min(1).optional(),
  canonicalURL: z.string().min(1).optional(),
  keywords: z.string().min(1).optional()
});

/**
 * Каркас сайта: то, что одинаково на всех страницах. Редактор правит это один
 * раз, а не пересобирает шапку и подвал в каждой странице заново. Меню здесь
 * не лежит — им занимается плагин навигации со своим конструктором.
 */
export const SiteSettingsSchema = z.object({
  brand: z.string().min(1),
  navCta: LinkSchema.optional(),
  footerContacts: z.array(
    z.object({ label: z.string().min(1), href: z.string().min(1).optional() })
  ),
  footerLegalLinks: z.array(LinkSchema),
  footerNote: z.string().min(1).optional(),
  defaultSeo: SeoSchema.optional()
});

export type NavItem = z.infer<typeof NavItemSchema>;
export type Seo = z.infer<typeof SeoSchema>;
export type SiteSettings = z.infer<typeof SiteSettingsSchema>;
