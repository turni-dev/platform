import { z } from 'zod';
import { LinkSchema } from '../shared';

/**
 * Тег приходит строкой (семя) либо повторяемым компонентом CMS, где у каждого
 * тега своё поле; компоненту в обоих случаях достаются строки.
 */
const TagSchema = z.union([
  z.string().min(1),
  z.object({ value: z.string().min(1) }).transform((tag) => tag.value)
]);

export const ChangelogItemBlockSchema = z.object({
  __component: z.literal('blocks.changelog-item'),
  /** Дата Strapi: `ГГГГ-ММ-ДД`, она же попадает в `datetime` разметки. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  version: z.string().min(1).optional(),
  title: z.string().min(1),
  body: z.string().min(1),
  tags: z.array(TagSchema).optional(),
  link: LinkSchema.optional()
});

export type ChangelogItemBlock = z.infer<typeof ChangelogItemBlockSchema>;
