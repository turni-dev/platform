import { z } from 'zod';
import { LinkSchema } from '../shared.js';

export const CaseCardsBlockSchema = z.object({
  __component: z.literal('blocks.case-cards'),
  heading: z.string().min(1),
  /** Пока проектов нет, секция честно говорит об этом и зовёт стать первым. */
  emptyState: z
    .object({
      body: z.string().min(1),
      cta: LinkSchema
    })
    .optional(),
  cases: z.array(
    z.object({
      title: z.string().min(1),
      task: z.string().min(1),
      built: z.string().min(1),
      result: z.string().min(1),
      href: z.string().min(1).optional()
    })
  )
});

export type CaseCardsBlock = z.infer<typeof CaseCardsBlockSchema>;
