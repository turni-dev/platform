import { z } from 'zod';

export const FaqBlockSchema = z.object({
  __component: z.literal('blocks.faq'),
  heading: z.string().min(1),
  items: z.array(
    z.object({
      question: z.string().min(1),
      answer: z.string().min(1)
    })
  )
});

export type FaqBlock = z.infer<typeof FaqBlockSchema>;
