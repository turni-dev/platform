import { z } from 'zod';

/**
 * Закрытый набор: свободная строка означала бы иконочный шрифт или внешнюю
 * зависимость, а гейт Lighthouse ≥90 такого не прощает.
 */
export const SecurityIconSchema = z.enum(['shield', 'server', 'eye', 'audit']);

export const SecurityListBlockSchema = z.object({
  __component: z.literal('blocks.security-list'),
  heading: z.string().min(1),
  items: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1).optional(),
      icon: SecurityIconSchema.optional()
    })
  )
});

export type SecurityIcon = z.infer<typeof SecurityIconSchema>;
export type SecurityListBlock = z.infer<typeof SecurityListBlockSchema>;
