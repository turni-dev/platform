import { z } from 'zod';
import { LinkSchema } from '../shared';

/**
 * Размер плитки — закрытый список, а не свободное число колонок: сетка должна
 * ломаться предсказуемо, иначе редактор соберёт ряд, который не сходится.
 */
export const BentoTileSizeSchema = z.enum(['standard', 'wide', 'tall']);

export const BentoBlockSchema = z.object({
  __component: z.literal('blocks.bento'),
  heading: z.string().min(1).optional(),
  intro: z.string().min(1).optional(),
  tiles: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1).optional(),
      size: BentoTileSizeSchema.optional(),
      cta: LinkSchema.optional()
    })
  )
});

export type BentoBlock = z.infer<typeof BentoBlockSchema>;
