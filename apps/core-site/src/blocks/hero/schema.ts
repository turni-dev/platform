import { z } from 'zod';
import { LinkSchema, MediaSchema } from '../shared';

export const HeroBlockSchema = z.object({
  __component: z.literal('blocks.hero'),
  heading: z.string().min(1),
  subheading: z.string().min(1),
  primaryCta: LinkSchema,
  secondaryCta: LinkSchema.optional(),
  media: MediaSchema.optional()
});

export type HeroBlock = z.infer<typeof HeroBlockSchema>;
