import { z } from 'zod';

export const StepsBlockSchema = z.object({
  __component: z.literal('blocks.steps'),
  heading: z.string().min(1),
  steps: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1)
    })
  ),
  note: z.string().min(1).optional()
});

export type StepsBlock = z.infer<typeof StepsBlockSchema>;
