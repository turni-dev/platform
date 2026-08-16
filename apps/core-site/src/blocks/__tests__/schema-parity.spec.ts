import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CaseCardsBlockSchema } from '../case-cards/schema';
import { FaqBlockSchema } from '../faq/schema';
import { FeatureGridBlockSchema } from '../feature-grid/schema';
import { HeroBlockSchema } from '../hero/schema';
import { LeadFormBlockSchema } from '../lead-form/schema';
import { SecurityListBlockSchema } from '../security-list/schema';
import { StepsBlockSchema } from '../steps/schema';

const componentsDirectory = resolve(
  __dirname,
  '../../../../cms/src/components/blocks'
);

const StrapiComponentSchema = z.object({
  info: z.object({ displayName: z.string().min(1) }),
  attributes: z.record(z.string(), z.unknown())
});

const blocks: ReadonlyArray<readonly [string, z.ZodObject]> = [
  ['hero', HeroBlockSchema],
  ['feature-grid', FeatureGridBlockSchema],
  ['steps', StepsBlockSchema],
  ['security-list', SecurityListBlockSchema],
  ['case-cards', CaseCardsBlockSchema],
  ['faq', FaqBlockSchema],
  ['lead-form', LeadFormBlockSchema]
];

function strapiFields(name: string): string[] {
  const raw: unknown = JSON.parse(
    readFileSync(resolve(componentsDirectory, `${name}.json`), 'utf8')
  );

  return Object.keys(StrapiComponentSchema.parse(raw).attributes).sort();
}

function schemaFields(schema: z.ZodObject): string[] {
  return Object.keys(schema.shape)
    .filter((field) => field !== '__component')
    .sort();
}

/**
 * Расхождение между кодом и админкой иначе всплывает только в проде — пустой
 * секцией на живой странице, поэтому оно ловится тестом, а не глазами.
 */
describe('Strapi components and block schemas', () => {
  it.each(blocks)('keeps %s in step with the CMS', (name, schema) => {
    expect(strapiFields(name)).toEqual(schemaFields(schema));
  });
});
