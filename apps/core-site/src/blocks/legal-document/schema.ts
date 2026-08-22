import { z } from 'zod';

/**
 * Юридический документ (оферта, политика ПДн и т. п.) как страница сайта.
 * `body` — markdown, тот же текст, что лежит в `docs/legal/*.md`, без секции
 * «открытые вопросы для юриста» — она остаётся внутренним артефактом и на
 * сайт не идёт. `draft` включает заметный бейдж «черновик»: владелец снимает
 * его прямо в CMS после юридической проверки, без правки кода.
 */
export const LegalDocumentBlockSchema = z.object({
  __component: z.literal('blocks.legal-document'),
  heading: z.string().min(1),
  updatedAt: z.string().min(1),
  draft: z.boolean(),
  body: z.string().min(1)
});

export type LegalDocumentBlock = z.infer<typeof LegalDocumentBlockSchema>;
