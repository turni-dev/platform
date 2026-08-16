import { z } from 'zod';
import { LinkSchema } from '../shared.js';

export const NavBlockSchema = z.object({
  __component: z.literal('blocks.nav'),
  brand: z.string().min(1),
  links: z.array(LinkSchema),
  cta: LinkSchema.optional()
});

export type NavBlock = z.infer<typeof NavBlockSchema>;
