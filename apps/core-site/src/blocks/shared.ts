import { z } from 'zod';

/** Every call to action and menu entry on the site looks like this. */
export const LinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1)
});

export type BlockLink = z.infer<typeof LinkSchema>;
