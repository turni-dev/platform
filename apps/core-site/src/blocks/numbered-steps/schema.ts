import { z } from 'zod';

export const NumberedStepsBlockSchema = z.object({
  __component: z.literal('blocks.numbered-steps'),
  heading: z.string().min(1),
  intro: z.string().min(1).optional(),
  steps: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      /** Короткая пометка вроде срока шага: показываем, только если она есть. */
      caption: z.string().min(1).optional()
    })
  ),
  note: z.string().min(1).optional()
});

export type NumberedStepsBlock = z.infer<typeof NumberedStepsBlockSchema>;
