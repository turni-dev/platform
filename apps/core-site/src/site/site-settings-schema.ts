import { z } from 'zod';
import { LinkSchema } from '../blocks/shared';

/** Пункт меню с одним уровнем вложенности: «Продукт → Кабинет, Виджет». */
export const NavItemSchema = LinkSchema.extend({
  children: z.array(LinkSchema).optional()
});

export const SeoSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  ogImage: z.string().min(1).optional(),
  noindex: z.boolean().optional()
});

/**
 * Каркас сайта: то, что одинаково на всех страницах. Редактор правит это один
 * раз, а не пересобирает шапку и подвал в каждой странице заново.
 */
export const SiteSettingsSchema = z.object({
  brand: z.string().min(1),
  nav: z.array(NavItemSchema),
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
