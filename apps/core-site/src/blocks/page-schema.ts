import { z } from 'zod';
import { CaseCardsBlockSchema } from './case-cards/schema.js';
import { FaqBlockSchema } from './faq/schema.js';
import { FeatureGridBlockSchema } from './feature-grid/schema.js';
import { FooterBlockSchema } from './footer/schema.js';
import { HeroBlockSchema } from './hero/schema.js';
import { LeadFormBlockSchema } from './lead-form/schema.js';
import { NavBlockSchema } from './nav/schema.js';
import { SecurityListBlockSchema } from './security-list/schema.js';
import { StepsBlockSchema } from './steps/schema.js';

/**
 * `__component` — дискриминант динамической зоны Strapi. Один блок кода
 * соответствует одному компоненту в админке, поэтому имена здесь и в
 * `apps/cms/src/components` обязаны совпадать буквально.
 */
export const BlockSchema = z.discriminatedUnion('__component', [
  NavBlockSchema,
  HeroBlockSchema,
  FeatureGridBlockSchema,
  StepsBlockSchema,
  SecurityListBlockSchema,
  CaseCardsBlockSchema,
  FaqBlockSchema,
  LeadFormBlockSchema,
  FooterBlockSchema
]);

export const PageSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  blocks: z.array(BlockSchema)
});

export type PageBlock = z.infer<typeof BlockSchema>;
export type Page = z.infer<typeof PageSchema>;
