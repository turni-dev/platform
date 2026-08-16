import { z } from 'zod';
import { LinkSchema } from '../shared.js';

export const FooterBlockSchema = z.object({
  __component: z.literal('blocks.footer'),
  contacts: z.array(
    z.object({
      label: z.string().min(1),
      href: z.string().min(1).optional()
    })
  ),
  legalLinks: z.array(LinkSchema),
  note: z.string().min(1).optional()
});

export type FooterBlock = z.infer<typeof FooterBlockSchema>;
