import { z } from 'zod';

export const FeatureGridBlockSchema = z.object({
  __component: z.literal('blocks.feature-grid'),
  heading: z.string().min(1).optional(),
  columns: z.union([z.literal(2), z.literal(3)]).optional(),
  items: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1).optional()
    })
  )
});

export type FeatureGridBlock = z.infer<typeof FeatureGridBlockSchema>;
