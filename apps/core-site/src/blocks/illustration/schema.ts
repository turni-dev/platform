import { z } from 'zod';
import { MediaSchema } from '../shared';

/**
 * Иллюстрация как самостоятельная секция: у референсов половина воздуха
 * держится на графике, и редактор ставит её туда, где страница выглядит
 * пустой, — не дожидаясь нового блока под каждый случай.
 */
export const IllustrationBlockSchema = z.object({
  __component: z.literal('blocks.illustration'),
  media: MediaSchema,
  /** Подпись под картинкой: видимый текст, а не замена alt. */
  caption: z.string().min(1).optional()
});

export type IllustrationBlock = z.infer<typeof IllustrationBlockSchema>;
