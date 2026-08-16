import { z } from 'zod';
import { LinkSchema } from '../shared.js';

export const HeroMediaSchema = z.object({
  src: z.string().min(1),
  alt: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export const HeroBlockSchema = z.object({
  __component: z.literal('blocks.hero'),
  heading: z.string().min(1),
  subheading: z.string().min(1),
  primaryCta: LinkSchema,
  secondaryCta: LinkSchema.optional(),
  media: HeroMediaSchema.optional()
});

export type HeroBlock = z.infer<typeof HeroBlockSchema>;
