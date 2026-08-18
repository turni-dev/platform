import { z } from 'zod';

export const StatCardBlockSchema = z.object({
  __component: z.literal('blocks.stat-card'),
  heading: z.string().min(1).optional(),
  intro: z.string().min(1).optional(),
  stats: z.array(
    z.object({
      /** Значение приходит строкой: у числа есть единица измерения и формат. */
      value: z.string().min(1),
      label: z.string().min(1),
      note: z.string().min(1).optional()
    })
  ),
  /** Откуда цифры: без ссылки на источник карточка выглядит выдумкой. */
  source: z.string().min(1).optional()
});

export type StatCardBlock = z.infer<typeof StatCardBlockSchema>;
