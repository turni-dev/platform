import { z } from 'zod';
import { LinkSchema } from '../shared';

/**
 * Блок задаёт только обрамление: заголовок, пояснение и ссылку на каталог.
 * Сами логотипы редактор в блок не заводит — они приходят из типа контента
 * «Интеграция», иначе стена и каталог расходились бы уже на второй правке.
 */
export const LogoWallBlockSchema = z.object({
  __component: z.literal('blocks.logo-wall'),
  heading: z.string().min(1),
  note: z.string().min(1).optional(),
  cta: LinkSchema.optional()
});

export type LogoWallBlock = z.infer<typeof LogoWallBlockSchema>;
