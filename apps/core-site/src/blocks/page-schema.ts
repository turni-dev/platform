import { z } from 'zod';
import { SeoSchema } from '../site/site-settings-schema';
import { BentoBlockSchema } from './bento/schema';
import { CaseCardsBlockSchema } from './case-cards/schema';
import { ChangelogItemBlockSchema } from './changelog-item/schema';
import { FaqBlockSchema } from './faq/schema';
import { FeatureGridBlockSchema } from './feature-grid/schema';
import { HeroBlockSchema } from './hero/schema';
import { LeadFormBlockSchema } from './lead-form/schema';
import { LogoWallBlockSchema } from './logo-wall/schema';
import { NumberedStepsBlockSchema } from './numbered-steps/schema';
import { SecurityListBlockSchema } from './security-list/schema';
import { StatCardBlockSchema } from './stat-card/schema';
import { StepsBlockSchema } from './steps/schema';

/**
 * `__component` — дискриминант динамической зоны Strapi. Один блок кода
 * соответствует одному компоненту в админке, поэтому имена здесь и в
 * `apps/cms/src/components` обязаны совпадать буквально.
 */
export const BlockSchema = z.discriminatedUnion('__component', [
  HeroBlockSchema,
  FeatureGridBlockSchema,
  StepsBlockSchema,
  SecurityListBlockSchema,
  CaseCardsBlockSchema,
  FaqBlockSchema,
  LeadFormBlockSchema,
  LogoWallBlockSchema,
  BentoBlockSchema,
  NumberedStepsBlockSchema,
  StatCardBlockSchema,
  ChangelogItemBlockSchema
]);

export const PageSchema = z.object({
  /** Путь любой глубины: `products/private-agent`, `legal/privacy`. */
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  seo: SeoSchema.optional(),
  blocks: z.array(BlockSchema)
});

export type PageBlock = z.infer<typeof BlockSchema>;
export type Page = z.infer<typeof PageSchema>;
